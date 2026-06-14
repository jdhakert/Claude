import { and, desc, asc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";
import { getProfile } from "./onboarding.js";

export interface DashboardData {
  course: { id: string; title: string; type: string } | null;
  readiness: number | null;
  examCountdown: { examDate: string | null; daysRemaining: number | null };
  diagnostic: {
    status: "not_started" | "scheduled" | "completed";
    scheduledFor: string | null;
    scorePct: number | null;
  };
  todaysAssignment: {
    id: string;
    forDate: string;
    estMinutes: number;
    status: string;
    items: Array<{
      id: string;
      kind: string;
      reason: string;
      estMinutes: number;
      status: string;
    }>;
  } | null;
  progressBySubject: Array<{
    subjectId: string;
    name: string;
    mastery: number | null;
    examWeight: number;
  }>;
  weakAreas: Array<{
    issueId: string;
    name: string;
    subject: string;
    mastery: number | null;
  }>;
  recentActivity: Array<{ type: string; occurredAt: string }>;
  nextTask: { kind: string; reason: string; estMinutes: number } | null;
}

function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** Aggregate the student dashboard entirely from database-backed records. */
export async function getDashboard(
  db: AppDb,
  userId: string,
): Promise<DashboardData> {
  const profile = await getProfile(db, userId);

  // Current course (most recent enrollment).
  const courseRows = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      type: schema.courses.type,
    })
    .from(schema.enrollments)
    .innerJoin(
      schema.courses,
      eq(schema.enrollments.courseId, schema.courses.id),
    )
    .where(eq(schema.enrollments.userId, userId))
    .orderBy(desc(schema.enrollments.createdAt))
    .limit(1);
  const course = courseRows[0] ?? null;

  // Exam countdown.
  const examDate = profile?.targetExamDate ?? null;
  const examCountdown = {
    examDate: examDate ? examDate.toISOString() : null,
    daysRemaining: examDate ? daysUntil(examDate) : null,
  };

  // Diagnostic status.
  const onboarding = (profile?.onboarding ?? {}) as {
    diagnosticScheduledFor?: string;
  };
  let diagnostic: DashboardData["diagnostic"] = {
    status: "not_started",
    scheduledFor: onboarding.diagnosticScheduledFor ?? null,
    scorePct: null,
  };
  if (course) {
    const diagExam = (
      await db
        .select({ id: schema.exams.id })
        .from(schema.exams)
        .where(
          and(
            eq(schema.exams.courseId, course.id),
            eq(schema.exams.kind, "diagnostic"),
          ),
        )
        .limit(1)
    )[0];
    if (diagExam) {
      const attempt = (
        await db
          .select({
            status: schema.examAttempts.status,
            rawScorePct: schema.examAttempts.rawScorePct,
          })
          .from(schema.examAttempts)
          .where(
            and(
              eq(schema.examAttempts.userId, userId),
              eq(schema.examAttempts.examId, diagExam.id),
            ),
          )
          .orderBy(desc(schema.examAttempts.startedAt))
          .limit(1)
      )[0];
      if (attempt?.status === "submitted") {
        diagnostic = {
          status: "completed",
          scheduledFor: onboarding.diagnosticScheduledFor ?? null,
          scorePct: attempt.rawScorePct ?? null,
        };
      } else if (onboarding.diagnosticScheduledFor) {
        diagnostic = { ...diagnostic, status: "scheduled" };
      }
    }
  }

  // Readiness (latest overall snapshot).
  const readinessRow = (
    await db
      .select({ readiness: schema.progressSnapshots.readiness })
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
  const readiness = readinessRow?.readiness ?? null;

  // Today's (most recent) assignment + its blocks.
  const assignment = (
    await db
      .select()
      .from(schema.assignments)
      .where(eq(schema.assignments.userId, userId))
      .orderBy(desc(schema.assignments.forDate))
      .limit(1)
  )[0];
  let todaysAssignment: DashboardData["todaysAssignment"] = null;
  let nextTask: DashboardData["nextTask"] = null;
  if (assignment) {
    const items = await db
      .select({
        id: schema.assignmentItems.id,
        kind: schema.assignmentItems.kind,
        reason: schema.assignmentItems.reason,
        estMinutes: schema.assignmentItems.estMinutes,
        status: schema.assignmentItems.status,
        sortOrder: schema.assignmentItems.sortOrder,
      })
      .from(schema.assignmentItems)
      .where(eq(schema.assignmentItems.assignmentId, assignment.id))
      .orderBy(asc(schema.assignmentItems.sortOrder));
    todaysAssignment = {
      id: assignment.id,
      forDate: assignment.forDate,
      estMinutes: assignment.estMinutes,
      status: assignment.status,
      items: items.map(({ sortOrder: _s, ...rest }) => rest),
    };
    const pending = items.find((i) => i.status === "pending") ?? items[0];
    if (pending) {
      nextTask = {
        kind: pending.kind,
        reason: pending.reason,
        estMinutes: pending.estMinutes,
      };
    }
  }

  // Progress by subject (latest snapshot per subject).
  const subjectRows = await db
    .select({
      subjectId: schema.subjects.id,
      name: schema.subjects.name,
      examWeight: schema.subjects.examWeight,
      mastery: schema.progressSnapshots.mastery,
      capturedAt: schema.progressSnapshots.capturedAt,
    })
    .from(schema.progressSnapshots)
    .innerJoin(
      schema.subjects,
      eq(schema.progressSnapshots.refId, schema.subjects.id),
    )
    .where(
      and(
        eq(schema.progressSnapshots.userId, userId),
        eq(schema.progressSnapshots.level, "subject"),
      ),
    )
    .orderBy(desc(schema.progressSnapshots.capturedAt));
  const seenSubjects = new Set<string>();
  const progressBySubject = subjectRows
    .filter((r) => {
      if (seenSubjects.has(r.subjectId)) return false;
      seenSubjects.add(r.subjectId);
      return true;
    })
    .map(({ subjectId, name, examWeight, mastery }) => ({
      subjectId,
      name,
      examWeight,
      mastery,
    }));

  // Weak areas (lowest-mastery issues).
  const weakAreas = await db
    .select({
      issueId: schema.issues.id,
      name: schema.issues.name,
      subject: schema.subjects.name,
      mastery: schema.progressSnapshots.mastery,
    })
    .from(schema.progressSnapshots)
    .innerJoin(
      schema.issues,
      eq(schema.progressSnapshots.refId, schema.issues.id),
    )
    .innerJoin(
      schema.subtopics,
      eq(schema.issues.subtopicId, schema.subtopics.id),
    )
    .innerJoin(
      schema.subjects,
      eq(schema.subtopics.subjectId, schema.subjects.id),
    )
    .where(
      and(
        eq(schema.progressSnapshots.userId, userId),
        eq(schema.progressSnapshots.level, "issue"),
      ),
    )
    .orderBy(asc(schema.progressSnapshots.mastery))
    .limit(5);

  // Recent activity.
  const recent = await db
    .select({
      type: schema.learningEvents.type,
      occurredAt: schema.learningEvents.occurredAt,
    })
    .from(schema.learningEvents)
    .where(eq(schema.learningEvents.userId, userId))
    .orderBy(desc(schema.learningEvents.occurredAt))
    .limit(5);
  const recentActivity = recent.map((r) => ({
    type: r.type,
    occurredAt: r.occurredAt.toISOString(),
  }));

  return {
    course,
    readiness,
    examCountdown,
    diagnostic,
    todaysAssignment,
    progressBySubject,
    weakAreas,
    recentActivity,
    nextTask,
  };
}
