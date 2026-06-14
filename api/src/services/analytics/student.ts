import { and, asc, desc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../../db.js";
import { essayAnalytics } from "../essays.js";
import { ptAnalytics } from "../pt.js";
import { completionTrend } from "../events.js";

async function latestByRef(
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
  for (const r of rows)
    if (r.refId && !map.has(r.refId)) map.set(r.refId, r.mastery);
  return map;
}

/** Full student analytics — entirely database-backed. */
export async function studentAnalytics(
  db: AppDb,
  userId: string,
  courseId: string,
) {
  // Readiness (latest overall snapshot).
  const overall = (
    await db
      .select({
        readiness: schema.progressSnapshots.readiness,
        coverage: schema.progressSnapshots.coverage,
        recency: schema.progressSnapshots.recency,
      })
      .from(schema.progressSnapshots)
      .where(
        and(
          eq(schema.progressSnapshots.userId, userId),
          eq(schema.progressSnapshots.level, "overall"),
        ),
      )
      .orderBy(desc(schema.progressSnapshots.capturedAt))
      .limit(1)
  )[0];

  // Subject / subtopic / issue performance.
  const subjMastery = await latestByRef(db, userId, "subject");
  const subjects = (
    await db
      .select({
        id: schema.subjects.id,
        name: schema.subjects.name,
        examWeight: schema.subjects.examWeight,
      })
      .from(schema.subjects)
      .where(eq(schema.subjects.courseId, courseId))
      .orderBy(asc(schema.subjects.sortOrder))
  ).map((s) => ({ ...s, mastery: subjMastery.get(s.id) ?? null }));

  const subMastery = await latestByRef(db, userId, "subtopic");
  const subtopics = (
    await db
      .select({
        id: schema.subtopics.id,
        name: schema.subtopics.name,
        subjectName: schema.subjects.name,
      })
      .from(schema.subtopics)
      .innerJoin(
        schema.subjects,
        eq(schema.subtopics.subjectId, schema.subjects.id),
      )
      .where(eq(schema.subjects.courseId, courseId))
  )
    .map((s) => ({ ...s, mastery: subMastery.get(s.id) ?? null }))
    .filter((s) => s.mastery != null)
    .sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0));

  const issueMastery = await latestByRef(db, userId, "issue");
  const issues = (
    await db
      .select({
        id: schema.issues.id,
        name: schema.issues.name,
        subjectName: schema.subjects.name,
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
      .where(eq(schema.subjects.courseId, courseId))
  )
    .map((i) => ({ ...i, mastery: issueMastery.get(i.id) ?? null }))
    .filter((i) => i.mastery != null)
    .sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0));

  // Timing + MBE accuracy trend from question attempts.
  const attempts = await db
    .select({
      isCorrect: schema.questionAttempts.isCorrect,
      timeMs: schema.questionAttempts.timeMs,
      answeredAt: schema.questionAttempts.answeredAt,
    })
    .from(schema.questionAttempts)
    .where(eq(schema.questionAttempts.userId, userId))
    .orderBy(asc(schema.questionAttempts.answeredAt));

  const timed = attempts.filter((a) => a.timeMs != null);
  const avgSecondsPerQuestion = timed.length
    ? Math.round(
        timed.reduce((acc, a) => acc + (a.timeMs ?? 0), 0) /
          timed.length /
          1000,
      )
    : null;

  const mbeByDay = new Map<string, { correct: number; total: number }>();
  for (const a of attempts) {
    const day = a.answeredAt.toISOString().slice(0, 10);
    const agg = mbeByDay.get(day) ?? { correct: 0, total: 0 };
    agg.total += 1;
    if (a.isCorrect) agg.correct += 1;
    mbeByDay.set(day, agg);
  }
  const mbeAccuracyTrend = [...mbeByDay.entries()].map(([date, a]) => ({
    date,
    accuracy: a.total ? a.correct / a.total : null,
    count: a.total,
  }));

  // Confidence calibration: accuracy per confidence bucket.
  const ratings = await db
    .select({
      level: schema.confidenceRatings.level,
      wasCorrect: schema.confidenceRatings.wasCorrect,
    })
    .from(schema.confidenceRatings)
    .innerJoin(
      schema.questionAttempts,
      eq(
        schema.confidenceRatings.questionAttemptId,
        schema.questionAttempts.id,
      ),
    )
    .where(eq(schema.questionAttempts.userId, userId));
  const buckets = ["guessing", "low", "medium", "high"] as const;
  const calibration = buckets.map((level) => {
    const inBucket = ratings.filter((r) => r.level === level);
    const correct = inBucket.filter((r) => r.wasCorrect).length;
    const accuracy = inBucket.length ? correct / inBucket.length : null;
    // Overconfident: high confidence but low accuracy. Underconfident: low
    // confidence but high accuracy.
    let flag: "overconfident" | "underconfident" | null = null;
    if (accuracy != null) {
      if ((level === "high" || level === "medium") && accuracy < 0.6)
        flag = "overconfident";
      if ((level === "guessing" || level === "low") && accuracy > 0.7)
        flag = "underconfident";
    }
    return { level, count: inBucket.length, accuracy, flag };
  });

  const [essay, pt, completion] = await Promise.all([
    essayAnalytics(db, userId),
    ptAnalytics(db, userId),
    completionTrend(db, userId),
  ]);

  // "What to do next": the lowest-mastery issue (or subject) the student has.
  const nextFocus =
    issues[0]?.name ??
    subjects.slice().sort((a, b) => (a.mastery ?? 1) - (b.mastery ?? 1))[0]
      ?.name ??
    null;

  return {
    readiness: overall?.readiness ?? null,
    coverage: overall?.coverage ?? null,
    recency: overall?.recency ?? null,
    nextFocus,
    subjects,
    subtopics: subtopics.slice(0, 12),
    issues: issues.slice(0, 12),
    timing: { avgSecondsPerQuestion },
    calibration,
    essayTrend: essay.trend,
    ptTrend: pt.trend,
    mbeAccuracyTrend,
    completionTrend: completion,
  };
}
