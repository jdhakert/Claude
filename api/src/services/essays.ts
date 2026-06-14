import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

const RUBRIC_DIMENSIONS = [
  "issue_spotting",
  "rule_statement",
  "application",
  "organization",
  "time_management",
];

/** List cleared essay prompts for a course. */
export async function listEssayPrompts(db: AppDb, courseId: string) {
  return db
    .select({
      id: schema.essayPrompts.id,
      prompt: schema.essayPrompts.prompt,
      timeLimitMinutes: schema.essayPrompts.timeLimitMinutes,
      subjectId: schema.essayPrompts.subjectId,
    })
    .from(schema.essayPrompts)
    .where(
      and(
        eq(schema.essayPrompts.courseId, courseId),
        eq(schema.essayPrompts.licenseStatus, "cleared"),
      ),
    )
    .orderBy(asc(schema.essayPrompts.createdAt));
}

async function rubricFor(db: AppDb, rubricId: string | null) {
  if (!rubricId) return [];
  return db
    .select({
      id: schema.essayRubricCriteria.id,
      dimension: schema.essayRubricCriteria.dimension,
      description: schema.essayRubricCriteria.description,
      maxScore: schema.essayRubricCriteria.maxScore,
      sortOrder: schema.essayRubricCriteria.sortOrder,
    })
    .from(schema.essayRubricCriteria)
    .where(eq(schema.essayRubricCriteria.rubricId, rubricId))
    .orderBy(asc(schema.essayRubricCriteria.sortOrder));
}

/** Prompt detail for taking the essay — model answer withheld until submit. */
export async function getEssayPrompt(db: AppDb, promptId: string) {
  const prompt = (
    await db
      .select()
      .from(schema.essayPrompts)
      .where(eq(schema.essayPrompts.id, promptId))
      .limit(1)
  )[0];
  if (!prompt || prompt.licenseStatus !== "cleared") return null;
  return {
    id: prompt.id,
    prompt: prompt.prompt,
    timeLimitMinutes: prompt.timeLimitMinutes,
    rubric: await rubricFor(db, prompt.rubricId),
  };
}

/** Submit a (timed) essay, then reveal the model answer + issue checklist. */
export async function submitEssay(
  db: AppDb,
  userId: string,
  promptId: string,
  input: { responseText: string; timeSpentSeconds: number },
) {
  const prompt = (
    await db
      .select()
      .from(schema.essayPrompts)
      .where(eq(schema.essayPrompts.id, promptId))
      .limit(1)
  )[0];
  if (!prompt || prompt.licenseStatus !== "cleared") return null;

  const submission = (
    await db
      .insert(schema.essaySubmissions)
      .values({
        userId,
        essayPromptId: promptId,
        responseText: input.responseText,
        timeSpentSeconds: input.timeSpentSeconds,
        status: "submitted",
        submittedAt: new Date(),
      })
      .returning()
  )[0]!;

  await db.insert(schema.learningEvents).values({
    userId,
    type: "essay_submitted",
    payload: { submissionId: submission.id, promptId },
  });

  const checklistIssues = await db
    .select({ id: schema.issues.id, name: schema.issues.name })
    .from(schema.essayPromptIssues)
    .innerJoin(
      schema.issues,
      eq(schema.essayPromptIssues.issueId, schema.issues.id),
    )
    .where(eq(schema.essayPromptIssues.essayPromptId, promptId));

  return {
    submissionId: submission.id,
    modelAnswer: prompt.modelAnswer,
    issueChecklist: checklistIssues,
    rubric: await rubricFor(db, prompt.rubricId),
  };
}

/** Persist the student's self-assessment + spotted-issue reconciliation. */
export async function selfAssess(
  db: AppDb,
  userId: string,
  submissionId: string,
  input: {
    scores: Array<{ dimension: string; score: number }>;
    spottedIssueIds: string[];
  },
) {
  const submission = (
    await db
      .select()
      .from(schema.essaySubmissions)
      .where(eq(schema.essaySubmissions.id, submissionId))
      .limit(1)
  )[0];
  if (!submission || submission.userId !== userId) return null;

  for (const s of input.scores) {
    await db.insert(schema.essayScores).values({
      essaySubmissionId: submissionId,
      dimension: s.dimension,
      score: s.score,
      isSelfAssessment: true,
    });
  }

  // Reconcile issue-spotting: checklist issues the student did NOT spot become
  // weak-issue signals.
  const checklist = await db
    .select({ issueId: schema.essayPromptIssues.issueId })
    .from(schema.essayPromptIssues)
    .where(
      eq(schema.essayPromptIssues.essayPromptId, submission.essayPromptId),
    );
  const missed = checklist
    .map((c) => c.issueId)
    .filter((id) => !input.spottedIssueIds.includes(id));
  for (const issueId of missed) {
    await db.insert(schema.errorJournalEntries).values({
      userId,
      issueId,
      cause: "wrong_issue_spotted",
      note: "Missed on essay issue-spotting reconciliation.",
    });
  }

  await db
    .update(schema.essaySubmissions)
    .set({
      graderMeta: {
        ...(submission.graderMeta ?? {}),
        spottedIssueIds: input.spottedIssueIds,
        missedIssueIds: missed,
      },
    })
    .where(eq(schema.essaySubmissions.id, submissionId));

  await writeEssayProgress(db, userId, submissionId);
  return { submissionId, missedIssueIds: missed };
}

/** Grader/admin scores a submission, comments, tags issues + rule weaknesses. */
export async function gradeSubmission(
  db: AppDb,
  graderId: string,
  submissionId: string,
  input: {
    scores: Array<{ dimension: string; score: number; notes?: string }>;
    comment?: string;
    missedIssueIds?: string[];
    ruleWeaknesses?: string[];
  },
) {
  const submission = (
    await db
      .select()
      .from(schema.essaySubmissions)
      .where(eq(schema.essaySubmissions.id, submissionId))
      .limit(1)
  )[0];
  if (!submission) return null;

  for (const s of input.scores) {
    await db.insert(schema.essayScores).values({
      essaySubmissionId: submissionId,
      dimension: s.dimension,
      score: s.score,
      isSelfAssessment: false,
      graderId,
      notes: s.notes ?? null,
    });
  }

  // Tagged missed issues feed the error journal (weak-issue signal).
  for (const issueId of input.missedIssueIds ?? []) {
    await db.insert(schema.errorJournalEntries).values({
      userId: submission.userId,
      issueId,
      cause: "wrong_issue_spotted",
      note: "Grader-tagged missed issue.",
    });
  }

  await db
    .update(schema.essaySubmissions)
    .set({
      graderId,
      gradedAt: new Date(),
      feedback: input.comment ?? null,
      graderMeta: {
        ...(submission.graderMeta ?? {}),
        missedIssueIds: input.missedIssueIds ?? [],
        ruleWeaknesses: input.ruleWeaknesses ?? [],
      },
    })
    .where(eq(schema.essaySubmissions.id, submissionId));

  await writeEssayProgress(db, submission.userId, submissionId);
  return getSubmission(db, submissionId);
}

/** Essay results feed progress: subject mastery from the rubric average. */
async function writeEssayProgress(
  db: AppDb,
  userId: string,
  submissionId: string,
) {
  const sub = (
    await db
      .select()
      .from(schema.essaySubmissions)
      .where(eq(schema.essaySubmissions.id, submissionId))
      .limit(1)
  )[0];
  if (!sub) return;
  const prompt = (
    await db
      .select()
      .from(schema.essayPrompts)
      .where(eq(schema.essayPrompts.id, sub.essayPromptId))
      .limit(1)
  )[0];
  if (!prompt) return;

  // Prefer grader scores; fall back to self-assessment.
  const scores = await db
    .select()
    .from(schema.essayScores)
    .where(eq(schema.essayScores.essaySubmissionId, submissionId));
  const grader = scores.filter((s) => !s.isSelfAssessment);
  const use = grader.length ? grader : scores;
  if (!use.length) return;
  const avg = use.reduce((acc, s) => acc + s.score, 0) / use.length / 5; // /maxScore(5)

  if (prompt.subjectId) {
    await db.insert(schema.progressSnapshots).values({
      userId,
      courseId: prompt.courseId,
      level: "subject",
      refId: prompt.subjectId,
      mastery: avg,
      coverage: 1,
      recency: 1,
    });
  }
}

export async function getSubmission(db: AppDb, submissionId: string) {
  const sub = (
    await db
      .select()
      .from(schema.essaySubmissions)
      .where(eq(schema.essaySubmissions.id, submissionId))
      .limit(1)
  )[0];
  if (!sub) return null;
  const scores = await db
    .select()
    .from(schema.essayScores)
    .where(eq(schema.essayScores.essaySubmissionId, submissionId));
  return {
    id: sub.id,
    userId: sub.userId,
    essayPromptId: sub.essayPromptId,
    responseText: sub.responseText,
    timeSpentSeconds: sub.timeSpentSeconds,
    status: sub.status,
    feedback: sub.feedback,
    gradedAt: sub.gradedAt ? sub.gradedAt.toISOString() : null,
    graderMeta: sub.graderMeta ?? {},
    selfScores: scores
      .filter((s) => s.isSelfAssessment)
      .map((s) => ({ dimension: s.dimension, score: s.score })),
    graderScores: scores
      .filter((s) => !s.isSelfAssessment)
      .map((s) => ({ dimension: s.dimension, score: s.score, notes: s.notes })),
  };
}

/** Submissions awaiting grading (grader/admin queue). */
export async function listForGrading(db: AppDb) {
  return db
    .select({
      id: schema.essaySubmissions.id,
      userId: schema.essaySubmissions.userId,
      essayPromptId: schema.essaySubmissions.essayPromptId,
      submittedAt: schema.essaySubmissions.submittedAt,
      gradedAt: schema.essaySubmissions.gradedAt,
    })
    .from(schema.essaySubmissions)
    .where(eq(schema.essaySubmissions.status, "submitted"))
    .orderBy(desc(schema.essaySubmissions.submittedAt));
}

/** Per-dimension averages + score trend across the student's submissions. */
export async function essayAnalytics(db: AppDb, userId: string) {
  const subs = await db
    .select({
      id: schema.essaySubmissions.id,
      submittedAt: schema.essaySubmissions.submittedAt,
      timeSpentSeconds: schema.essaySubmissions.timeSpentSeconds,
    })
    .from(schema.essaySubmissions)
    .where(eq(schema.essaySubmissions.userId, userId))
    .orderBy(asc(schema.essaySubmissions.submittedAt));

  const subIds = subs.map((s) => s.id);
  const scores = subIds.length
    ? await db
        .select()
        .from(schema.essayScores)
        .where(inArray(schema.essayScores.essaySubmissionId, subIds))
    : [];

  // Per-dimension average (0..1).
  const byDim = new Map<string, { sum: number; n: number }>();
  for (const s of scores) {
    const agg = byDim.get(s.dimension) ?? { sum: 0, n: 0 };
    agg.sum += s.score;
    agg.n += 1;
    byDim.set(s.dimension, agg);
  }
  const dimensions = RUBRIC_DIMENSIONS.map((d) => {
    const agg = byDim.get(d);
    return { dimension: d, average: agg ? agg.sum / agg.n / 5 : null };
  });

  // Overall score trend per submission.
  const trend = subs.map((sub) => {
    const ss = scores.filter((s) => s.essaySubmissionId === sub.id);
    const overall = ss.length
      ? ss.reduce((a, s) => a + s.score, 0) / ss.length / 5
      : null;
    return {
      submissionId: sub.id,
      submittedAt: sub.submittedAt ? sub.submittedAt.toISOString() : null,
      overall,
      timeSpentSeconds: sub.timeSpentSeconds,
    };
  });

  return { dimensions, trend };
}
