import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../../db.js";
import { generatePlan, type Signals } from "./engine.js";

function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/** Latest snapshot value per refId for a given level. */
async function latestMastery(
  db: AppDb,
  userId: string,
  level: "subject" | "subtopic" | "issue",
) {
  const rows = await db
    .select({
      refId: schema.progressSnapshots.refId,
      mastery: schema.progressSnapshots.mastery,
      capturedAt: schema.progressSnapshots.capturedAt,
    })
    .from(schema.progressSnapshots)
    .where(
      and(
        eq(schema.progressSnapshots.userId, userId),
        eq(schema.progressSnapshots.level, level),
      ),
    )
    .orderBy(desc(schema.progressSnapshots.capturedAt));
  const map = new Map<string, number | null>();
  for (const r of rows) {
    if (r.refId && !map.has(r.refId)) map.set(r.refId, r.mastery);
  }
  return map;
}

/** Gather the full signal snapshot for a student + course. */
export async function gatherSignals(
  db: AppDb,
  userId: string,
  courseId: string,
  minutesOverride?: number,
): Promise<Signals> {
  const profile = (
    await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1)
  )[0];
  const daysToExam = daysUntil(profile?.targetExamDate ?? null);
  const weekly = profile?.weeklyTimeBudgetMinutes
    ? parseInt(profile.weeklyTimeBudgetMinutes, 10)
    : NaN;
  const dailyMinutes =
    minutesOverride ?? (Number.isFinite(weekly) ? Math.round(weekly / 7) : 60);

  // Subjects + mastery.
  const subjectRows = await db
    .select()
    .from(schema.subjects)
    .where(eq(schema.subjects.courseId, courseId))
    .orderBy(asc(schema.subjects.sortOrder));
  const subjectMastery = await latestMastery(db, userId, "subject");
  const subjects = subjectRows.map((s) => ({
    id: s.id,
    name: s.name,
    examWeight: s.examWeight,
    mastery: subjectMastery.get(s.id) ?? null,
  }));
  // Learnable: cleared lessons for the course not yet completed.
  const subtopicMastery = await latestMastery(db, userId, "subtopic");
  const lessonRows = await db
    .select({
      lessonId: schema.lessons.id,
      subtopicId: schema.lessons.subtopicId,
      name: schema.lessons.title,
      subjectWeight: schema.subjects.examWeight,
    })
    .from(schema.lessons)
    .innerJoin(schema.modules, eq(schema.lessons.moduleId, schema.modules.id))
    .leftJoin(
      schema.subtopics,
      eq(schema.lessons.subtopicId, schema.subtopics.id),
    )
    .leftJoin(
      schema.subjects,
      eq(schema.subtopics.subjectId, schema.subjects.id),
    )
    .where(
      and(
        eq(schema.modules.courseId, courseId),
        eq(schema.lessons.licenseStatus, "cleared"),
      ),
    )
    .orderBy(asc(schema.lessons.sortOrder));
  const completed = new Set(
    (
      await db
        .select({ lessonId: schema.lessonProgress.lessonId })
        .from(schema.lessonProgress)
        .where(
          and(
            eq(schema.lessonProgress.userId, userId),
            eq(schema.lessonProgress.status, "completed"),
          ),
        )
    ).map((r) => r.lessonId),
  );
  const seenLesson = new Set<string>();
  const learnable = lessonRows
    .filter((l) => !completed.has(l.lessonId) && !seenLesson.has(l.lessonId))
    .map((l) => {
      seenLesson.add(l.lessonId);
      return {
        subtopicId: l.subtopicId ?? l.lessonId,
        lessonId: l.lessonId,
        name: l.name,
        subjectWeight: l.subjectWeight ?? 1,
        mastery: l.subtopicId
          ? (subtopicMastery.get(l.subtopicId) ?? null)
          : null,
      };
    })
    .slice(0, 4);

  // Weak issues + miss/confidence signals.
  const issueMastery = await latestMastery(db, userId, "issue");
  const issueRows = await db
    .select({
      id: schema.issues.id,
      name: schema.issues.name,
      subjectWeight: schema.subjects.examWeight,
    })
    .from(schema.issues)
    .innerJoin(
      schema.subtopics,
      eq(schema.issues.subtopicId, schema.subtopics.id),
    )
    .innerJoin(
      schema.subjects,
      eq(schema.subtopics.subjectId, schema.subjects.id),
    )
    .where(eq(schema.subjects.courseId, courseId));
  const issueById = new Map(issueRows.map((i) => [i.id, i]));

  // Attempts joined to the item's primary issue + confidence rating.
  const attempts = await db
    .select({
      isCorrect: schema.questionAttempts.isCorrect,
      issueId: schema.items.primaryIssueId,
      confidence: schema.confidenceRatings.level,
      wasCorrect: schema.confidenceRatings.wasCorrect,
    })
    .from(schema.questionAttempts)
    .innerJoin(
      schema.items,
      eq(schema.questionAttempts.itemId, schema.items.id),
    )
    .leftJoin(
      schema.confidenceRatings,
      eq(
        schema.confidenceRatings.questionAttemptId,
        schema.questionAttempts.id,
      ),
    )
    .where(eq(schema.questionAttempts.userId, userId));

  const issueStats = new Map<
    string,
    { misses: number; overconfident: boolean; lowConfidence: boolean }
  >();
  for (const a of attempts) {
    if (!a.issueId) continue;
    const st = issueStats.get(a.issueId) ?? {
      misses: 0,
      overconfident: false,
      lowConfidence: false,
    };
    if (!a.isCorrect) st.misses += 1;
    if (a.confidence === "high" && a.wasCorrect === false)
      st.overconfident = true;
    if (a.confidence === "guessing" || a.confidence === "low")
      st.lowConfidence = true;
    issueStats.set(a.issueId, st);
  }

  // Candidate weak issues: those with a low mastery snapshot OR repeated misses.
  const weakIssueIds = new Set<string>([
    ...[...issueMastery.entries()]
      .filter(([id, m]) => issueById.has(id) && (m ?? 0) < 0.7)
      .map(([id]) => id),
    ...[...issueStats.entries()]
      .filter(([id, s]) => issueById.has(id) && s.misses > 0)
      .map(([id]) => id),
  ]);
  const weakIssues = [...weakIssueIds]
    .map((id) => {
      const meta = issueById.get(id)!;
      const st = issueStats.get(id) ?? {
        misses: 0,
        overconfident: false,
        lowConfidence: false,
      };
      return {
        id,
        name: meta.name,
        subjectWeight: meta.subjectWeight,
        mastery: issueMastery.get(id) ?? null,
        repeatedMisses: st.misses,
        overconfident: st.overconfident,
        lowConfidence: st.lowConfidence,
      };
    })
    .sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0))
    .slice(0, 6);

  // SRS due.
  const due = await db
    .select({ dueAt: schema.srsReviews.dueAt })
    .from(schema.srsReviews)
    .where(
      and(
        eq(schema.srsReviews.userId, userId),
        lte(schema.srsReviews.dueAt, new Date()),
      ),
    );
  const srsDueCount = due.length;
  const srsMaxOverdueDays = due.reduce((acc, r) => {
    const d = Math.floor(
      (Date.now() - r.dueAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.max(acc, d);
  }, 0);

  // Rules to review = black-letter rules tied to weak issues.
  const rulesDueCount = weakIssues.length
    ? (
        await db
          .select({ id: schema.rules.id })
          .from(schema.rules)
          .where(
            inArray(
              schema.rules.issueId,
              weakIssues.map((w) => w.id),
            ),
          )
      ).length
    : 0;

  const errorJournalCount = (
    await db
      .select({ id: schema.errorJournalEntries.id })
      .from(schema.errorJournalEntries)
      .where(eq(schema.errorJournalEntries.userId, userId))
  ).length;

  // Essay signal.
  const essayPrompt = (
    await db
      .select({ id: schema.essayPrompts.id })
      .from(schema.essayPrompts)
      .where(
        and(
          eq(schema.essayPrompts.courseId, courseId),
          eq(schema.essayPrompts.licenseStatus, "cleared"),
        ),
      )
      .limit(1)
  )[0];
  const essayCount = (
    await db
      .select({ id: schema.essaySubmissions.id })
      .from(schema.essaySubmissions)
      .where(eq(schema.essaySubmissions.userId, userId))
  ).length;

  // PT signal.
  const ptTask = (
    await db
      .select({ id: schema.ptTasks.id })
      .from(schema.ptTasks)
      .where(
        and(
          eq(schema.ptTasks.courseId, courseId),
          eq(schema.ptTasks.licenseStatus, "cleared"),
        ),
      )
      .limit(1)
  )[0];
  const ptCount = (
    await db
      .select({ id: schema.ptSubmissions.id })
      .from(schema.ptSubmissions)
      .where(eq(schema.ptSubmissions.userId, userId))
  ).length;

  // Full-length: near exam, none submitted recently.
  const fullLengthExam = (
    await db
      .select({ id: schema.exams.id })
      .from(schema.exams)
      .where(
        and(
          eq(schema.exams.courseId, courseId),
          eq(schema.exams.kind, "full_length"),
        ),
      )
      .limit(1)
  )[0];
  let fullLengthDue = false;
  if (fullLengthExam && daysToExam != null && daysToExam <= 14) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recent = await db
      .select({ id: schema.examAttempts.id })
      .from(schema.examAttempts)
      .where(
        and(
          eq(schema.examAttempts.userId, userId),
          eq(schema.examAttempts.examId, fullLengthExam.id),
          eq(schema.examAttempts.status, "submitted"),
          gte(schema.examAttempts.completedAt, weekAgo),
        ),
      );
    fullLengthDue = recent.length === 0;
  }

  return {
    daysToExam,
    dailyMinutes,
    subjects,
    learnable,
    weakIssues,
    srsDueCount,
    srsMaxOverdueDays,
    rulesDueCount,
    errorJournalCount,
    essay: {
      available: Boolean(essayPrompt),
      weak: essayCount === 0,
      promptId: essayPrompt?.id ?? null,
    },
    pt: {
      available: Boolean(ptTask),
      weak: ptCount === 0,
      taskId: ptTask?.id ?? null,
    },
    fullLength: { due: fullLengthDue, examId: fullLengthExam?.id ?? null },
  };
}

/**
 * Generate, persist, and return today's adaptive plan. Replaces any existing
 * plan for the same (user, course, date) so it always reflects current state.
 */
export async function generateDailyPlan(
  db: AppDb,
  userId: string,
  courseId: string,
  opts: { date?: string; minutesOverride?: number } = {},
) {
  const forDate = opts.date ?? new Date().toISOString().slice(0, 10);
  const signals = await gatherSignals(
    db,
    userId,
    courseId,
    opts.minutesOverride,
  );
  const plan = generatePlan(signals);

  // Replace any existing assignment for this day (items cascade).
  const existing = await db
    .select({ id: schema.assignments.id })
    .from(schema.assignments)
    .where(
      and(
        eq(schema.assignments.userId, userId),
        eq(schema.assignments.courseId, courseId),
        eq(schema.assignments.forDate, forDate),
      ),
    );
  if (existing.length) {
    await db.delete(schema.assignments).where(
      inArray(
        schema.assignments.id,
        existing.map((e) => e.id),
      ),
    );
  }

  const assignment = (
    await db
      .insert(schema.assignments)
      .values({
        userId,
        courseId,
        forDate,
        status: "pending",
        estMinutes: plan.estMinutes,
      })
      .returning()
  )[0]!;

  if (plan.blocks.length) {
    await db.insert(schema.assignmentItems).values(
      plan.blocks.map((b, i) => ({
        assignmentId: assignment.id,
        kind: b.kind,
        refType: b.refType,
        refId: b.refId,
        reason: b.reason,
        estMinutes: b.estMinutes,
        status: "pending" as const,
        sortOrder: i + 1,
      })),
    );
  }

  return {
    assignmentId: assignment.id,
    forDate,
    estMinutes: plan.estMinutes,
    blocks: plan.blocks,
    signals,
  };
}
