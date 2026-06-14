import { eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

/** Get or create the first-party "Original" content source for authoring. */
async function ensureOriginalSource(db: AppDb): Promise<string> {
  const existing = (
    await db
      .select({ id: schema.contentSources.id })
      .from(schema.contentSources)
      .where(eq(schema.contentSources.name, "BarReady Original"))
      .limit(1)
  )[0];
  if (existing) return existing.id;
  const inserted = await db
    .insert(schema.contentSources)
    .values({ name: "BarReady Original", provenance: "original" })
    .returning();
  return inserted[0]!.id;
}

export async function createCourse(
  db: AppDb,
  input: {
    slug: string;
    title: string;
    type: "ube" | "california" | "mbe_only" | "essay_only" | "mpre";
    jurisdiction: "ube" | "california" | "mbe" | "mpre" | "federal" | "general";
    description?: string;
  },
) {
  const rows = await db.insert(schema.courses).values(input).returning();
  return rows[0]!;
}

export async function updateCourse(
  db: AppDb,
  id: string,
  patch: Partial<{ title: string; description: string }>,
) {
  const rows = await db
    .update(schema.courses)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.courses.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function createModule(
  db: AppDb,
  input: { courseId: string; title: string; sortOrder?: number },
) {
  const rows = await db.insert(schema.modules).values(input).returning();
  return rows[0]!;
}

export async function updateModule(
  db: AppDb,
  id: string,
  patch: Partial<{ title: string; sortOrder: number }>,
) {
  const rows = await db
    .update(schema.modules)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.modules.id, id))
    .returning();
  return rows[0] ?? null;
}

/**
 * Create a lesson. New content starts `in_review` (NOT cleared), so it is
 * invisible to students until a reviewer clears it (licensing gate).
 */
export async function createLesson(
  db: AppDb,
  authorId: string,
  input: {
    moduleId: string;
    title: string;
    subtopicId?: string;
    sortOrder?: number;
    jurisdiction?:
      | "ube"
      | "california"
      | "mbe"
      | "mpre"
      | "federal"
      | "general";
  },
) {
  const sourceId = await ensureOriginalSource(db);
  const rows = await db
    .insert(schema.lessons)
    .values({
      moduleId: input.moduleId,
      title: input.title,
      subtopicId: input.subtopicId ?? null,
      sortOrder: input.sortOrder ?? 0,
      sourceId,
      provenance: "original",
      licenseStatus: "in_review",
      jurisdiction: input.jurisdiction ?? "general",
      authorId,
      version: 1,
    })
    .returning();
  return rows[0]!;
}

export async function updateLesson(
  db: AppDb,
  id: string,
  patch: Partial<{ title: string; sortOrder: number }>,
) {
  const rows = await db
    .update(schema.lessons)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.lessons.id, id))
    .returning();
  return rows[0] ?? null;
}

export type BlockKind =
  | "text"
  | "checklist"
  | "rule_statement"
  | "example"
  | "mini_quiz"
  | "video"
  | "outline_download"
  | "callout";

export async function createBlock(
  db: AppDb,
  input: {
    lessonId: string;
    kind: BlockKind;
    body: Record<string, unknown>;
    sortOrder?: number;
  },
) {
  const rows = await db
    .insert(schema.contentBlocks)
    .values({
      lessonId: input.lessonId,
      kind: input.kind,
      body: input.body,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return rows[0]!;
}

export async function updateBlock(
  db: AppDb,
  id: string,
  patch: Partial<{
    kind: BlockKind;
    body: Record<string, unknown>;
    sortOrder: number;
  }>,
) {
  const rows = await db
    .update(schema.contentBlocks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.contentBlocks.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteBlock(db: AppDb, id: string) {
  await db.delete(schema.contentBlocks).where(eq(schema.contentBlocks.id, id));
}
