import { and, desc, eq, ilike } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

export type ContentKind = "question" | "lesson" | "essay" | "pt" | "flashcard";
type Status = "draft" | "in_review" | "approved" | "published" | "archived";
export type Action = "submit" | "approve" | "reject" | "publish" | "archive";

/** Loosely-typed registry (admin-only module; AppDb is already `any`-HKT). */
const REGISTRY: Record<ContentKind, { table: any; title: any; label: string }> =
  {
    question: {
      table: schema.items,
      title: schema.items.stem,
      label: "Question",
    },
    lesson: {
      table: schema.lessons,
      title: schema.lessons.title,
      label: "Lesson",
    },
    essay: {
      table: schema.essayPrompts,
      title: schema.essayPrompts.prompt,
      label: "Essay prompt",
    },
    pt: {
      table: schema.ptTasks,
      title: schema.ptTasks.title,
      label: "PT task",
    },
    flashcard: {
      table: schema.flashcards,
      title: schema.flashcards.front,
      label: "Flashcard",
    },
  };

export const CONTENT_KINDS = Object.keys(REGISTRY) as ContentKind[];

export class CmsError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function summarize(kind: ContentKind, row: any) {
  const reg = REGISTRY[kind];
  return {
    kind,
    id: row.id,
    title: String(row[(reg.title as { name: string }).name] ?? "").slice(
      0,
      100,
    ),
    contentStatus: row.contentStatus as Status,
    licenseStatus: row.licenseStatus as string,
    provenance: row.provenance as string,
    jurisdiction: row.jurisdiction as string,
    version: row.version as number,
    authorId: row.authorId as string,
    reviewerId: (row.reviewerId as string | null) ?? null,
  };
}

/** List content of a kind, with status filter + title search. */
export async function listContent(
  db: AppDb,
  kind: ContentKind,
  opts: { status?: Status; q?: string } = {},
) {
  const reg = REGISTRY[kind];
  const filters = [];
  if (opts.status) filters.push(eq(reg.table.contentStatus, opts.status));
  if (opts.q) filters.push(ilike(reg.title, `%${opts.q}%`));
  const rows = await db
    .select()
    .from(reg.table)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(reg.table.updatedAt));
  return rows.map((r: any) => summarize(kind, r));
}

/** Admin dashboard: counts per kind per status. */
export async function cmsDashboard(db: AppDb) {
  const result: Array<{
    kind: ContentKind;
    label: string;
    total: number;
    byStatus: Record<string, number>;
  }> = [];
  for (const kind of CONTENT_KINDS) {
    const reg = REGISTRY[kind];
    const rows = await db
      .select({ contentStatus: reg.table.contentStatus })
      .from(reg.table);
    const byStatus: Record<string, number> = {};
    for (const r of rows as Array<{ contentStatus: string }>) {
      byStatus[r.contentStatus] = (byStatus[r.contentStatus] ?? 0) + 1;
    }
    result.push({ kind, label: reg.label, total: rows.length, byStatus });
  }
  return result;
}

const ALLOWED: Record<Action, Status[]> = {
  submit: ["draft"],
  approve: ["in_review"],
  reject: ["in_review", "approved"],
  publish: ["approved"],
  archive: ["draft", "in_review", "approved", "published"],
};

/**
 * Drive a content item through the editorial lifecycle. `publish` requires the
 * item to be approved AND to carry complete source/license metadata + a
 * reviewer; it is the only transition that sets license_status = cleared
 * (student-visible). `archive` un-clears it. Every transition is audit-logged.
 */
export async function transition(
  db: AppDb,
  actorId: string,
  kind: ContentKind,
  id: string,
  action: Action,
) {
  const reg = REGISTRY[kind];
  const row = (
    await db.select().from(reg.table).where(eq(reg.table.id, id)).limit(1)
  )[0];
  if (!row) throw new CmsError("not_found", "Content not found.");

  const current = row.contentStatus as Status;
  if (!ALLOWED[action].includes(current)) {
    throw new CmsError(
      "invalid_transition",
      `Cannot ${action} content that is ${current}.`,
    );
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  let newStatus: Status = current;
  let licenseTransition = false;
  const beforeLicense = row.licenseStatus;

  switch (action) {
    case "submit":
      newStatus = "in_review";
      break;
    case "approve":
      if (actorId === row.authorId)
        throw new CmsError(
          "reviewer_is_author",
          "A reviewer must be different from the author.",
        );
      newStatus = "approved";
      patch.reviewerId = actorId;
      break;
    case "reject":
      newStatus = "draft";
      break;
    case "publish": {
      const missing: string[] = [];
      if (!row.sourceId) missing.push("source");
      if (!row.provenance) missing.push("provenance");
      if (!row.jurisdiction) missing.push("jurisdiction");
      if (!row.authorId) missing.push("author");
      if (!row.reviewerId) missing.push("reviewer");
      if (missing.length)
        throw new CmsError(
          "missing_license_metadata",
          `Cannot publish — missing: ${missing.join(", ")}.`,
        );
      newStatus = "published";
      patch.licenseStatus = "cleared";
      patch.version = (row.version ?? 1) + 1;
      licenseTransition = true;
      break;
    }
    case "archive":
      newStatus = "archived";
      // Un-clear so students immediately lose access.
      if (row.licenseStatus === "cleared") {
        patch.licenseStatus = "in_review";
        licenseTransition = true;
      }
      break;
  }
  patch.contentStatus = newStatus;

  const updated = (
    await db
      .update(reg.table)
      .set(patch)
      .where(eq(reg.table.id, id))
      .returning()
  )[0]!;

  await db.insert(schema.auditLogs).values({
    actorId,
    action: licenseTransition ? "license_transition" : "update",
    entityType: kind,
    entityId: id,
    before: { contentStatus: current, license_status: beforeLicense },
    after: { contentStatus: newStatus, license_status: updated.licenseStatus },
    reason: `CMS ${action}`,
  });

  return summarize(kind, updated);
}

/** Audit/version history for a piece of content. */
export async function contentHistory(db: AppDb, kind: ContentKind, id: string) {
  const logs = await db
    .select()
    .from(schema.auditLogs)
    .where(
      and(
        eq(schema.auditLogs.entityType, kind),
        eq(schema.auditLogs.entityId, id),
      ),
    )
    .orderBy(desc(schema.auditLogs.createdAt));
  return logs.map((l) => ({
    action: l.action,
    actorId: l.actorId,
    before: l.before,
    after: l.after,
    reason: l.reason,
    at: l.createdAt.toISOString(),
  }));
}
