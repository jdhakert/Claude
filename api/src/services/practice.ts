import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

/** Subjects → subtopics for a course (practice set selection). */
export async function getPracticeTaxonomy(db: AppDb, courseId: string) {
  const subjects = await db
    .select({
      id: schema.subjects.id,
      name: schema.subjects.name,
      sortOrder: schema.subjects.sortOrder,
    })
    .from(schema.subjects)
    .where(eq(schema.subjects.courseId, courseId))
    .orderBy(asc(schema.subjects.sortOrder));

  const subjectIds = subjects.map((s) => s.id);
  const subtopics = subjectIds.length
    ? await db
        .select({
          id: schema.subtopics.id,
          subjectId: schema.subtopics.subjectId,
          name: schema.subtopics.name,
          sortOrder: schema.subtopics.sortOrder,
        })
        .from(schema.subtopics)
        .where(inArray(schema.subtopics.subjectId, subjectIds))
        .orderBy(asc(schema.subtopics.sortOrder))
    : [];

  return subjects.map((s) => ({
    id: s.id,
    name: s.name,
    subtopics: subtopics
      .filter((st) => st.subjectId === s.id)
      .map((st) => ({ id: st.id, name: st.name })),
  }));
}

export interface PracticeQuery {
  courseId: string;
  subjectId?: string;
  subtopicId?: string;
  mixed?: boolean;
  limit?: number;
}

/** A practice set of CLEARED items — no answer/correctness leakage. */
export async function getPracticeItems(db: AppDb, q: PracticeQuery) {
  const filters = [
    eq(schema.subjects.courseId, q.courseId),
    // Students only ever see license-cleared content (Policy §5).
    eq(schema.items.licenseStatus, "cleared"),
  ];
  if (q.subjectId) filters.push(eq(schema.subjects.id, q.subjectId));
  if (q.subtopicId) filters.push(eq(schema.subtopics.id, q.subtopicId));

  const rows = await db
    .select({
      id: schema.items.id,
      stem: schema.items.stem,
      subject: schema.subjects.name,
      subtopic: schema.subtopics.name,
    })
    .from(schema.items)
    .innerJoin(
      schema.subtopics,
      eq(schema.items.subtopicId, schema.subtopics.id),
    )
    .innerJoin(
      schema.subjects,
      eq(schema.subtopics.subjectId, schema.subjects.id),
    )
    .where(and(...filters))
    .orderBy(q.mixed ? sql`random()` : asc(schema.items.createdAt))
    .limit(Math.min(q.limit ?? 10, 50));

  const itemIds = rows.map((r) => r.id);
  const choices = itemIds.length
    ? await db
        .select({
          id: schema.answerChoices.id,
          itemId: schema.answerChoices.itemId,
          label: schema.answerChoices.label,
          body: schema.answerChoices.body,
          sortOrder: schema.answerChoices.sortOrder,
        })
        .from(schema.answerChoices)
        .where(inArray(schema.answerChoices.itemId, itemIds))
        .orderBy(asc(schema.answerChoices.sortOrder))
    : [];

  return rows.map((r) => ({
    id: r.id,
    stem: r.stem,
    subject: r.subject,
    subtopic: r.subtopic,
    choices: choices
      .filter((c) => c.itemId === r.id)
      .map((c) => ({ id: c.id, label: c.label, body: c.body })),
  }));
}

export interface SubmitAttemptInput {
  itemId: string;
  selectedChoiceId: string;
  confidence: "guessing" | "low" | "medium" | "high";
  timeMs: number;
  mode: "tutor" | "timed" | "exam" | "diagnostic";
  examAttemptId?: string;
}

/**
 * Record an attempt (correctness computed server-side) and return the full
 * review payload: per-choice rationale, explanation, tested issue, and rule.
 */
export async function submitAttempt(
  db: AppDb,
  userId: string,
  input: SubmitAttemptInput,
) {
  const item = (
    await db
      .select({
        id: schema.items.id,
        primaryIssueId: schema.items.primaryIssueId,
        licenseStatus: schema.items.licenseStatus,
      })
      .from(schema.items)
      .where(eq(schema.items.id, input.itemId))
      .limit(1)
  )[0];
  if (!item || item.licenseStatus !== "cleared") return null;

  const choices = await db
    .select()
    .from(schema.answerChoices)
    .where(eq(schema.answerChoices.itemId, input.itemId))
    .orderBy(asc(schema.answerChoices.sortOrder));
  const correct = choices.find((c) => c.isCorrect);
  const isCorrect = correct?.id === input.selectedChoiceId;

  const attempt = (
    await db
      .insert(schema.questionAttempts)
      .values({
        userId,
        itemId: input.itemId,
        selectedChoiceId: input.selectedChoiceId,
        isCorrect,
        timeMs: input.timeMs,
        mode: input.mode,
        examAttemptId: input.examAttemptId ?? null,
        answeredAt: new Date(),
      })
      .returning()
  )[0]!;

  await db.insert(schema.confidenceRatings).values({
    questionAttemptId: attempt.id,
    level: input.confidence,
    wasCorrect: isCorrect,
  });

  await db.insert(schema.learningEvents).values({
    userId,
    type: "question_answered",
    payload: { itemId: input.itemId, correct: isCorrect },
  });

  const explanation = (
    await db
      .select({ body: schema.explanations.body })
      .from(schema.explanations)
      .where(eq(schema.explanations.itemId, input.itemId))
      .limit(1)
  )[0];

  let issue: { id: string; name: string } | null = null;
  let rule: { statement: string } | null = null;
  if (item.primaryIssueId) {
    issue =
      (
        await db
          .select({ id: schema.issues.id, name: schema.issues.name })
          .from(schema.issues)
          .where(eq(schema.issues.id, item.primaryIssueId))
          .limit(1)
      )[0] ?? null;
    rule =
      (
        await db
          .select({ statement: schema.rules.statement })
          .from(schema.rules)
          .where(eq(schema.rules.issueId, item.primaryIssueId))
          .limit(1)
      )[0] ?? null;
  }

  return {
    attemptId: attempt.id,
    isCorrect,
    correctChoiceId: correct?.id ?? null,
    confidence: input.confidence,
    issue,
    ruleTakeaway: rule?.statement ?? null,
    explanation: explanation?.body ?? null,
    choices: choices.map((c) => ({
      id: c.id,
      label: c.label,
      body: c.body,
      isCorrect: c.isCorrect,
      rationale: c.rationale,
    })),
  };
}
