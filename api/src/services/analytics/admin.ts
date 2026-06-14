import { and, desc, eq, inArray } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../../db.js";

/** Latest overall readiness per user. */
async function readinessByUser(db: AppDb) {
  const rows = await db
    .select({
      userId: schema.progressSnapshots.userId,
      readiness: schema.progressSnapshots.readiness,
      capturedAt: schema.progressSnapshots.capturedAt,
    })
    .from(schema.progressSnapshots)
    .where(eq(schema.progressSnapshots.level, "overall"))
    .orderBy(desc(schema.progressSnapshots.capturedAt));
  const map = new Map<string, number | null>();
  for (const r of rows) if (!map.has(r.userId)) map.set(r.userId, r.readiness);
  return map;
}

/** Students with their readiness + recent activity (instructor list). */
export async function studentList(db: AppDb) {
  const studentRole = (
    await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.key, "student"))
      .limit(1)
  )[0];
  if (!studentRole) return [];
  const studentIds = (
    await db
      .select({ userId: schema.userRoles.userId })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.roleId, studentRole.id))
  ).map((r) => r.userId);
  if (!studentIds.length) return [];

  const users = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(inArray(schema.users.id, studentIds));
  const readiness = await readinessByUser(db);

  const events = await db
    .select({
      userId: schema.learningEvents.userId,
      occurredAt: schema.learningEvents.occurredAt,
    })
    .from(schema.learningEvents)
    .where(inArray(schema.learningEvents.userId, studentIds));
  const lastActive = new Map<string, Date>();
  for (const e of events) {
    const prev = lastActive.get(e.userId);
    if (!prev || e.occurredAt > prev) lastActive.set(e.userId, e.occurredAt);
  }

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    readiness: readiness.get(u.id) ?? null,
    lastActiveAt: lastActive.get(u.id)?.toISOString() ?? null,
  }));
}

/** Cohort overview: counts + readiness distribution. */
export async function cohortOverview(db: AppDb) {
  const students = await studentList(db);
  const withReadiness = students.filter((s) => s.readiness != null);
  const avg = withReadiness.length
    ? withReadiness.reduce((a, s) => a + (s.readiness ?? 0), 0) /
      withReadiness.length
    : null;
  const distribution = { low: 0, medium: 0, high: 0 };
  for (const s of withReadiness) {
    const r = s.readiness ?? 0;
    if (r < 0.5) distribution.low += 1;
    else if (r < 0.75) distribution.medium += 1;
    else distribution.high += 1;
  }
  return {
    totalStudents: students.length,
    averageReadiness: avg,
    distribution,
  };
}

/** At-risk: low readiness OR no activity in 14 days. */
export async function atRiskStudents(db: AppDb) {
  const students = await studentList(db);
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  return students
    .map((s) => {
      const reasons: string[] = [];
      if (s.readiness != null && s.readiness < 0.5)
        reasons.push("low readiness");
      if (!s.lastActiveAt || new Date(s.lastActiveAt).getTime() < cutoff)
        reasons.push("inactive 14d+");
      return { ...s, reasons };
    })
    .filter((s) => s.reasons.length > 0);
}

/** Question difficulty + content performance from attempts. */
export async function questionDifficulty(db: AppDb, courseId: string) {
  const rows = await db
    .select({
      itemId: schema.items.id,
      stem: schema.items.stem,
      subject: schema.subjects.name,
      isCorrect: schema.questionAttempts.isCorrect,
    })
    .from(schema.questionAttempts)
    .innerJoin(
      schema.items,
      eq(schema.questionAttempts.itemId, schema.items.id),
    )
    .innerJoin(
      schema.subtopics,
      eq(schema.items.subtopicId, schema.subtopics.id),
    )
    .innerJoin(
      schema.subjects,
      eq(schema.subtopics.subjectId, schema.subjects.id),
    )
    .where(eq(schema.subjects.courseId, courseId));

  const byItem = new Map<
    string,
    { stem: string; subject: string; correct: number; total: number }
  >();
  for (const r of rows) {
    const agg = byItem.get(r.itemId) ?? {
      stem: r.stem,
      subject: r.subject,
      correct: 0,
      total: 0,
    };
    agg.total += 1;
    if (r.isCorrect) agg.correct += 1;
    byItem.set(r.itemId, agg);
  }
  return [...byItem.entries()]
    .map(([itemId, a]) => ({
      itemId,
      stem: a.stem.slice(0, 90),
      subject: a.subject,
      attempts: a.total,
      correctRate: a.total ? a.correct / a.total : null,
    }))
    .sort((a, b) => (a.correctRate ?? 1) - (b.correctRate ?? 1));
}

/** Commonly missed issues across all students (misses + error-journal flags). */
export async function commonlyMissedIssues(db: AppDb, courseId: string) {
  const misses = await db
    .select({
      issueId: schema.items.primaryIssueId,
      name: schema.issues.name,
      isCorrect: schema.questionAttempts.isCorrect,
    })
    .from(schema.questionAttempts)
    .innerJoin(
      schema.items,
      eq(schema.questionAttempts.itemId, schema.items.id),
    )
    .innerJoin(schema.issues, eq(schema.items.primaryIssueId, schema.issues.id))
    .innerJoin(
      schema.subtopics,
      eq(schema.issues.subtopicId, schema.subtopics.id),
    )
    .innerJoin(
      schema.subjects,
      eq(schema.subtopics.subjectId, schema.subjects.id),
    )
    .where(eq(schema.subjects.courseId, courseId));

  const byIssue = new Map<
    string,
    { name: string; misses: number; total: number }
  >();
  for (const m of misses) {
    if (!m.issueId) continue;
    const agg = byIssue.get(m.issueId) ?? { name: m.name, misses: 0, total: 0 };
    agg.total += 1;
    if (!m.isCorrect) agg.misses += 1;
    byIssue.set(m.issueId, agg);
  }
  return [...byIssue.entries()]
    .map(([issueId, a]) => ({
      issueId,
      name: a.name,
      misses: a.misses,
      attempts: a.total,
      missRate: a.total ? a.misses / a.total : null,
    }))
    .filter((i) => i.misses > 0)
    .sort((a, b) => b.misses - a.misses);
}

/** Individual student progress (instructor drill-down). */
export async function studentProgress(
  db: AppDb,
  userId: string,
  courseId: string,
) {
  const subjMastery = new Map<string, number | null>();
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
        eq(schema.progressSnapshots.level, "subject"),
      ),
    )
    .orderBy(desc(schema.progressSnapshots.capturedAt));
  for (const r of rows)
    if (r.refId && !subjMastery.has(r.refId))
      subjMastery.set(r.refId, r.mastery);

  const readiness = (await readinessByUser(db)).get(userId) ?? null;
  const subjects = (
    await db
      .select({ id: schema.subjects.id, name: schema.subjects.name })
      .from(schema.subjects)
      .where(eq(schema.subjects.courseId, courseId))
  ).map((s) => ({ ...s, mastery: subjMastery.get(s.id) ?? null }));

  return { userId, readiness, subjects };
}
