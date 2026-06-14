import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

// PT-specific rubric dimensions (Phase 12 §3).
export const PT_DIMENSIONS = [
  "organization",
  "rule_extraction",
  "fact_use",
  "task_compliance",
  "product_format",
  "completeness",
];

export async function listPtTasks(db: AppDb, courseId: string) {
  return db
    .select({
      id: schema.ptTasks.id,
      title: schema.ptTasks.title,
      expectedProduct: schema.ptTasks.expectedProduct,
      timeLimitMinutes: schema.ptTasks.timeLimitMinutes,
    })
    .from(schema.ptTasks)
    .where(
      and(
        eq(schema.ptTasks.courseId, courseId),
        eq(schema.ptTasks.licenseStatus, "cleared"),
      ),
    )
    .orderBy(asc(schema.ptTasks.createdAt));
}

/** Task detail for the workspace — model work product withheld until submit. */
export async function getPtTask(db: AppDb, taskId: string) {
  const task = (
    await db
      .select()
      .from(schema.ptTasks)
      .where(eq(schema.ptTasks.id, taskId))
      .limit(1)
  )[0];
  if (!task || task.licenseStatus !== "cleared") return null;
  const fl = (task.fileLibrary ?? {}) as {
    files?: unknown[];
    library?: unknown[];
  };
  return {
    id: task.id,
    title: task.title,
    instructions: task.instructions,
    expectedProduct: task.expectedProduct,
    timeLimitMinutes: task.timeLimitMinutes,
    files: fl.files ?? [],
    library: fl.library ?? [],
    rubric: PT_DIMENSIONS,
  };
}

export async function submitPt(
  db: AppDb,
  userId: string,
  taskId: string,
  input: { responseText: string; timeSpentSeconds: number },
) {
  const task = (
    await db
      .select()
      .from(schema.ptTasks)
      .where(eq(schema.ptTasks.id, taskId))
      .limit(1)
  )[0];
  if (!task || task.licenseStatus !== "cleared") return null;

  const submission = (
    await db
      .insert(schema.ptSubmissions)
      .values({
        userId,
        ptTaskId: taskId,
        responseText: input.responseText,
        timeSpentSeconds: input.timeSpentSeconds,
        status: "submitted",
        submittedAt: new Date(),
      })
      .returning()
  )[0]!;

  await db.insert(schema.learningEvents).values({
    userId,
    type: "pt_submitted",
    payload: { submissionId: submission.id, taskId },
  });

  const checklist = await db
    .select({ id: schema.issues.id, name: schema.issues.name })
    .from(schema.ptTaskIssues)
    .innerJoin(schema.issues, eq(schema.ptTaskIssues.issueId, schema.issues.id))
    .where(eq(schema.ptTaskIssues.ptTaskId, taskId));

  return {
    submissionId: submission.id,
    modelWorkProduct: task.modelWorkProduct,
    issueChecklist: checklist,
    rubric: PT_DIMENSIONS,
  };
}

export async function selfAssessPt(
  db: AppDb,
  userId: string,
  submissionId: string,
  scores: Array<{ dimension: string; score: number }>,
) {
  const sub = (
    await db
      .select()
      .from(schema.ptSubmissions)
      .where(eq(schema.ptSubmissions.id, submissionId))
      .limit(1)
  )[0];
  if (!sub || sub.userId !== userId) return null;
  for (const s of scores) {
    await db.insert(schema.ptScores).values({
      ptSubmissionId: submissionId,
      dimension: s.dimension,
      score: s.score,
      isSelfAssessment: true,
    });
  }
  await writePtProgress(db, userId, submissionId);
  return { submissionId };
}

export async function gradePt(
  db: AppDb,
  graderId: string,
  submissionId: string,
  input: {
    scores: Array<{ dimension: string; score: number; notes?: string }>;
    comment?: string;
    ruleWeaknesses?: string[];
  },
) {
  const sub = (
    await db
      .select()
      .from(schema.ptSubmissions)
      .where(eq(schema.ptSubmissions.id, submissionId))
      .limit(1)
  )[0];
  if (!sub) return null;

  for (const s of input.scores) {
    await db.insert(schema.ptScores).values({
      ptSubmissionId: submissionId,
      dimension: s.dimension,
      score: s.score,
      isSelfAssessment: false,
      graderId,
      notes: s.notes ?? null,
    });
  }
  await db
    .update(schema.ptSubmissions)
    .set({
      graderId,
      gradedAt: new Date(),
      feedback: input.comment ?? null,
      graderMeta: {
        ...(sub.graderMeta ?? {}),
        ruleWeaknesses: input.ruleWeaknesses ?? [],
      },
    })
    .where(eq(schema.ptSubmissions.id, submissionId));

  await writePtProgress(db, sub.userId, submissionId);
  return getPtSubmission(db, submissionId);
}

async function writePtProgress(
  db: AppDb,
  userId: string,
  submissionId: string,
) {
  const sub = (
    await db
      .select()
      .from(schema.ptSubmissions)
      .where(eq(schema.ptSubmissions.id, submissionId))
      .limit(1)
  )[0];
  if (!sub) return;
  const task = (
    await db
      .select()
      .from(schema.ptTasks)
      .where(eq(schema.ptTasks.id, sub.ptTaskId))
      .limit(1)
  )[0];
  if (!task) return;

  const scores = await db
    .select()
    .from(schema.ptScores)
    .where(eq(schema.ptScores.ptSubmissionId, submissionId));
  const grader = scores.filter((s) => !s.isSelfAssessment);
  const use = grader.length ? grader : scores;
  if (!use.length) return;
  const avg = use.reduce((a, s) => a + s.score, 0) / use.length / 5;

  // PT is a skill that spans the course; record an overall snapshot.
  await db.insert(schema.progressSnapshots).values({
    userId,
    courseId: task.courseId,
    level: "overall",
    mastery: avg,
    recency: 1,
  });
}

export async function getPtSubmission(db: AppDb, submissionId: string) {
  const sub = (
    await db
      .select()
      .from(schema.ptSubmissions)
      .where(eq(schema.ptSubmissions.id, submissionId))
      .limit(1)
  )[0];
  if (!sub) return null;
  const scores = await db
    .select()
    .from(schema.ptScores)
    .where(eq(schema.ptScores.ptSubmissionId, submissionId));
  return {
    id: sub.id,
    userId: sub.userId,
    ptTaskId: sub.ptTaskId,
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

export async function listPtForGrading(db: AppDb) {
  return db
    .select({
      id: schema.ptSubmissions.id,
      userId: schema.ptSubmissions.userId,
      ptTaskId: schema.ptSubmissions.ptTaskId,
      submittedAt: schema.ptSubmissions.submittedAt,
      gradedAt: schema.ptSubmissions.gradedAt,
    })
    .from(schema.ptSubmissions)
    .where(eq(schema.ptSubmissions.status, "submitted"))
    .orderBy(desc(schema.ptSubmissions.submittedAt));
}

export async function ptAnalytics(db: AppDb, userId: string) {
  const subs = await db
    .select({
      id: schema.ptSubmissions.id,
      submittedAt: schema.ptSubmissions.submittedAt,
      timeSpentSeconds: schema.ptSubmissions.timeSpentSeconds,
    })
    .from(schema.ptSubmissions)
    .where(eq(schema.ptSubmissions.userId, userId))
    .orderBy(asc(schema.ptSubmissions.submittedAt));
  const ids = subs.map((s) => s.id);
  const scores = ids.length
    ? await db
        .select()
        .from(schema.ptScores)
        .where(inArray(schema.ptScores.ptSubmissionId, ids))
    : [];

  const byDim = new Map<string, { sum: number; n: number }>();
  for (const s of scores) {
    const agg = byDim.get(s.dimension) ?? { sum: 0, n: 0 };
    agg.sum += s.score;
    agg.n += 1;
    byDim.set(s.dimension, agg);
  }
  const dimensions = PT_DIMENSIONS.map((d) => {
    const agg = byDim.get(d);
    return { dimension: d, average: agg ? agg.sum / agg.n / 5 : null };
  });
  const trend = subs.map((sub) => {
    const ss = scores.filter((s) => s.ptSubmissionId === sub.id);
    return {
      submissionId: sub.id,
      submittedAt: sub.submittedAt ? sub.submittedAt.toISOString() : null,
      overall: ss.length
        ? ss.reduce((a, s) => a + s.score, 0) / ss.length / 5
        : null,
      timeSpentSeconds: sub.timeSpentSeconds,
    };
  });
  return { dimensions, trend };
}
