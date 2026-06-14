import { and, asc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../../db.js";

export async function listOutlines(
  db: AppDb,
  userId: string,
  courseId: string,
) {
  return db
    .select()
    .from(schema.attackOutlines)
    .where(
      and(
        eq(schema.attackOutlines.userId, userId),
        eq(schema.attackOutlines.courseId, courseId),
      ),
    )
    .orderBy(asc(schema.attackOutlines.createdAt));
}

export async function createOutline(
  db: AppDb,
  userId: string,
  input: { courseId: string; subjectId?: string; title: string },
) {
  return (
    await db
      .insert(schema.attackOutlines)
      .values({
        userId,
        courseId: input.courseId,
        subjectId: input.subjectId ?? null,
        title: input.title,
      })
      .returning()
  )[0]!;
}

async function owns(db: AppDb, userId: string, outlineId: string) {
  const o = (
    await db
      .select({ userId: schema.attackOutlines.userId })
      .from(schema.attackOutlines)
      .where(eq(schema.attackOutlines.id, outlineId))
      .limit(1)
  )[0];
  return o?.userId === userId;
}

export async function getOutline(db: AppDb, userId: string, outlineId: string) {
  if (!(await owns(db, userId, outlineId))) return null;
  const outline = (
    await db
      .select()
      .from(schema.attackOutlines)
      .where(eq(schema.attackOutlines.id, outlineId))
      .limit(1)
  )[0]!;
  const entries = await db
    .select()
    .from(schema.attackOutlineEntries)
    .where(eq(schema.attackOutlineEntries.outlineId, outlineId))
    .orderBy(asc(schema.attackOutlineEntries.sortOrder));
  return { outline, entries };
}

export async function addEntry(
  db: AppDb,
  userId: string,
  outlineId: string,
  input: {
    issueId?: string;
    rule?: string;
    triggerFacts?: string;
    commonTraps?: string;
    checklist?: string[];
    sortOrder?: number;
  },
) {
  if (!(await owns(db, userId, outlineId))) return null;
  return (
    await db
      .insert(schema.attackOutlineEntries)
      .values({
        outlineId,
        issueId: input.issueId ?? null,
        rule: input.rule ?? null,
        triggerFacts: input.triggerFacts ?? null,
        commonTraps: input.commonTraps ?? null,
        checklist: input.checklist ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning()
  )[0]!;
}

export async function updateEntry(
  db: AppDb,
  userId: string,
  entryId: string,
  patch: {
    rule?: string;
    triggerFacts?: string;
    commonTraps?: string;
    checklist?: string[];
    sortOrder?: number;
  },
) {
  const entry = (
    await db
      .select({
        outlineId: schema.attackOutlineEntries.outlineId,
      })
      .from(schema.attackOutlineEntries)
      .where(eq(schema.attackOutlineEntries.id, entryId))
      .limit(1)
  )[0];
  if (!entry || !(await owns(db, userId, entry.outlineId))) return null;
  return (
    await db
      .update(schema.attackOutlineEntries)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.attackOutlineEntries.id, entryId))
      .returning()
  )[0]!;
}

export async function deleteEntry(db: AppDb, userId: string, entryId: string) {
  const entry = (
    await db
      .select({ outlineId: schema.attackOutlineEntries.outlineId })
      .from(schema.attackOutlineEntries)
      .where(eq(schema.attackOutlineEntries.id, entryId))
      .limit(1)
  )[0];
  if (!entry || !(await owns(db, userId, entry.outlineId))) return false;
  await db
    .delete(schema.attackOutlineEntries)
    .where(eq(schema.attackOutlineEntries.id, entryId));
  return true;
}
