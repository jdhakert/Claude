import { eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

type Jurisdiction =
  | "ube"
  | "california"
  | "mbe"
  | "mpre"
  | "federal"
  | "general";
type Provenance = "original" | "licensed" | "public_domain" | "user_supplied";

async function ensureSource(
  db: AppDb,
  name: string,
  provenance: Provenance,
): Promise<string> {
  const existing = (
    await db
      .select({ id: schema.contentSources.id })
      .from(schema.contentSources)
      .where(eq(schema.contentSources.name, name))
      .limit(1)
  )[0];
  if (existing) return existing.id;
  const inserted = await db
    .insert(schema.contentSources)
    .values({ name, provenance })
    .returning();
  return inserted[0]!.id;
}

export interface ImportItemInput {
  subtopicId: string;
  primaryIssueId?: string;
  stem: string;
  difficulty?: number;
  // Mandatory licensing metadata (Content & Licensing Policy §3).
  source: { name: string; provenance: Provenance };
  jurisdiction: Jurisdiction;
  choices: Array<{
    label: string;
    body: string;
    isCorrect: boolean;
    rationale?: string;
  }>;
  explanation?: string;
  issueIds?: string[];
}

/**
 * Import a single MBE item with full licensing metadata. New items start
 * `in_review` (NOT cleared) so they are invisible to students until a reviewer
 * clears them. The route layer enforces that license metadata is present.
 */
export async function importItem(
  db: AppDb,
  authorId: string,
  input: ImportItemInput,
) {
  const sourceId = await ensureSource(
    db,
    input.source.name,
    input.source.provenance,
  );

  const item = (
    await db
      .insert(schema.items)
      .values({
        subtopicId: input.subtopicId,
        primaryIssueId: input.primaryIssueId ?? null,
        stem: input.stem,
        difficulty: input.difficulty ?? 0.5,
        sourceId,
        provenance: input.source.provenance,
        licenseStatus: "in_review",
        jurisdiction: input.jurisdiction,
        authorId,
        version: 1,
      })
      .returning()
  )[0]!;

  await db.insert(schema.answerChoices).values(
    input.choices.map((c, i) => ({
      itemId: item.id,
      label: c.label,
      body: c.body,
      isCorrect: c.isCorrect,
      rationale: c.rationale ?? null,
      sortOrder: i + 1,
    })),
  );

  if (input.explanation) {
    await db
      .insert(schema.explanations)
      .values({ itemId: item.id, body: input.explanation });
  }

  if (input.issueIds?.length) {
    await db
      .insert(schema.itemIssues)
      .values(input.issueIds.map((issueId) => ({ itemId: item.id, issueId })));
  }

  return item;
}

/**
 * Clear an item for student use: reviewer (≠ author) verifies provenance and
 * sets license_status = cleared, with an audit-log entry.
 */
export async function clearItem(db: AppDb, reviewerId: string, itemId: string) {
  const item = (
    await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.id, itemId))
      .limit(1)
  )[0];
  if (!item) return null;

  const updated = (
    await db
      .update(schema.items)
      .set({ licenseStatus: "cleared", reviewerId, updatedAt: new Date() })
      .where(eq(schema.items.id, itemId))
      .returning()
  )[0]!;

  await db.insert(schema.auditLogs).values({
    actorId: reviewerId,
    action: "license_transition",
    entityType: "items",
    entityId: itemId,
    before: { license_status: item.licenseStatus },
    after: { license_status: "cleared" },
    reason: "Reviewer cleared item for student use.",
  });

  return updated;
}
