import { and, asc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

export interface GetLessonOptions {
  userId: string;
  /** Preview bypasses the cleared-content gate (authors/reviewers/admin). */
  preview?: boolean;
}

/** A lesson with its ordered content blocks, gated on license status. */
export async function getLesson(
  db: AppDb,
  lessonId: string,
  opts: GetLessonOptions,
) {
  const lesson = (
    await db
      .select({
        id: schema.lessons.id,
        moduleId: schema.lessons.moduleId,
        title: schema.lessons.title,
        licenseStatus: schema.lessons.licenseStatus,
      })
      .from(schema.lessons)
      .where(eq(schema.lessons.id, lessonId))
      .limit(1)
  )[0];
  if (!lesson) return null;
  // Students only ever see cleared content (Content & Licensing Policy §5).
  if (lesson.licenseStatus !== "cleared" && !opts.preview) return null;

  const blocks = await db
    .select({
      id: schema.contentBlocks.id,
      kind: schema.contentBlocks.kind,
      body: schema.contentBlocks.body,
      sortOrder: schema.contentBlocks.sortOrder,
    })
    .from(schema.contentBlocks)
    .where(eq(schema.contentBlocks.lessonId, lessonId))
    .orderBy(asc(schema.contentBlocks.sortOrder));

  const progress = (
    await db
      .select({
        status: schema.lessonProgress.status,
        timeSpentSeconds: schema.lessonProgress.timeSpentSeconds,
        startedAt: schema.lessonProgress.startedAt,
        completedAt: schema.lessonProgress.completedAt,
      })
      .from(schema.lessonProgress)
      .where(
        and(
          eq(schema.lessonProgress.userId, opts.userId),
          eq(schema.lessonProgress.lessonId, lessonId),
        ),
      )
      .limit(1)
  )[0];

  return {
    lesson: {
      id: lesson.id,
      title: lesson.title,
      licenseStatus: lesson.licenseStatus,
      preview: lesson.licenseStatus !== "cleared",
    },
    blocks: blocks.map(({ sortOrder: _s, ...rest }) => rest),
    progress: progress ?? {
      status: "not_started" as const,
      timeSpentSeconds: 0,
      startedAt: null,
      completedAt: null,
    },
  };
}

async function upsertProgress(
  db: AppDb,
  userId: string,
  lessonId: string,
  patch: Partial<{
    status: "in_progress" | "completed";
    completedAt: Date | null;
    addSeconds: number;
  }>,
) {
  const existing = (
    await db
      .select()
      .from(schema.lessonProgress)
      .where(
        and(
          eq(schema.lessonProgress.userId, userId),
          eq(schema.lessonProgress.lessonId, lessonId),
        ),
      )
      .limit(1)
  )[0];

  const now = new Date();
  if (!existing) {
    const inserted = await db
      .insert(schema.lessonProgress)
      .values({
        userId,
        lessonId,
        status: patch.status ?? "in_progress",
        startedAt: now,
        lastViewedAt: now,
        completedAt: patch.completedAt ?? null,
        timeSpentSeconds: patch.addSeconds ?? 0,
      })
      .returning();
    return inserted[0]!;
  }

  const updated = await db
    .update(schema.lessonProgress)
    .set({
      status: patch.status ?? existing.status,
      startedAt: existing.startedAt ?? now,
      lastViewedAt: now,
      completedAt: patch.completedAt ?? existing.completedAt,
      timeSpentSeconds: existing.timeSpentSeconds + (patch.addSeconds ?? 0),
      updatedAt: now,
    })
    .where(eq(schema.lessonProgress.id, existing.id))
    .returning();
  return updated[0]!;
}

export async function startLesson(db: AppDb, userId: string, lessonId: string) {
  const progress = await upsertProgress(db, userId, lessonId, {
    status: "in_progress",
  });
  await db.insert(schema.learningEvents).values({
    userId,
    type: "lesson_started",
    payload: { lessonId },
  });
  return progress;
}

export async function completeLesson(
  db: AppDb,
  userId: string,
  lessonId: string,
  timeSpentSeconds: number,
) {
  const progress = await upsertProgress(db, userId, lessonId, {
    status: "completed",
    completedAt: new Date(),
    addSeconds: Math.max(0, Math.floor(timeSpentSeconds)),
  });
  // Completion updates progress: recorded as a learning event (feeds recent
  // activity + analytics rollups).
  await db.insert(schema.learningEvents).values({
    userId,
    type: "lesson_completed",
    payload: { lessonId, timeSpentSeconds },
  });
  return progress;
}
