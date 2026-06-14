import { and, asc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

export type LearningEventType =
  | "lesson_viewed"
  | "lesson_started"
  | "lesson_completed"
  | "question_answered"
  | "exam_started"
  | "exam_completed"
  | "essay_submitted"
  | "pt_submitted"
  | "review_completed"
  | "assignment_completed"
  | "diagnostic_completed"
  | "remediation_started"
  | "remediation_verified";

/**
 * Canonical event-tracking service. All learning activity is recorded here so
 * analytics + completion trends have a single, append-only source (Arch §5).
 */
export async function track(
  db: AppDb,
  userId: string,
  type: LearningEventType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(schema.learningEvents).values({ userId, type, payload });
}

/** Daily activity counts (completion trend) for a user. */
export async function completionTrend(db: AppDb, userId: string) {
  const events = await db
    .select({
      type: schema.learningEvents.type,
      occurredAt: schema.learningEvents.occurredAt,
    })
    .from(schema.learningEvents)
    .where(eq(schema.learningEvents.userId, userId))
    .orderBy(asc(schema.learningEvents.occurredAt));

  const byDay = new Map<string, number>();
  for (const e of events) {
    const day = e.occurredAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return [...byDay.entries()].map(([date, count]) => ({ date, count }));
}

/** Count of events of a given type for a user (e.g. lessons completed). */
export async function countEvents(
  db: AppDb,
  userId: string,
  type: LearningEventType,
): Promise<number> {
  const rows = await db
    .select({ id: schema.learningEvents.id })
    .from(schema.learningEvents)
    .where(
      and(
        eq(schema.learningEvents.userId, userId),
        eq(schema.learningEvents.type, type),
      ),
    );
  return rows.length;
}
