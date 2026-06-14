import { eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

type ErrorCause =
  | "didnt_know_rule"
  | "misread_facts"
  | "wrong_issue_spotted"
  | "rule_misapplied"
  | "timing_rushed"
  | "careless"
  | "trap_distractor";

/** Add a "why I missed it" error-journal entry tied to an attempt + issue. */
export async function addErrorJournal(
  db: AppDb,
  userId: string,
  input: {
    questionAttemptId?: string;
    issueId?: string;
    cause: ErrorCause;
    note?: string;
  },
) {
  const rows = await db
    .insert(schema.errorJournalEntries)
    .values({
      userId,
      questionAttemptId: input.questionAttemptId ?? null,
      issueId: input.issueId ?? null,
      cause: input.cause,
      note: input.note ?? null,
    })
    .returning();
  return rows[0]!;
}

async function ensureUserSource(db: AppDb): Promise<string> {
  const name = "User Generated";
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
    .values({ name, provenance: "user_supplied" })
    .returning();
  return inserted[0]!.id;
}

/**
 * Convert a missed question into a personal flashcard. User-created cards are
 * provenance `user_supplied` and cleared for the author's own SRS use.
 */
export async function createFlashcard(
  db: AppDb,
  userId: string,
  input: {
    issueId?: string;
    front: string;
    back: string;
    jurisdiction?:
      | "ube"
      | "california"
      | "mbe"
      | "mpre"
      | "federal"
      | "general";
  },
) {
  const sourceId = await ensureUserSource(db);
  const rows = await db
    .insert(schema.flashcards)
    .values({
      issueId: input.issueId ?? null,
      front: input.front,
      back: input.back,
      sourceId,
      provenance: "user_supplied",
      licenseStatus: "cleared",
      jurisdiction: input.jurisdiction ?? "general",
      authorId: userId,
      version: 1,
    })
    .returning();
  return rows[0]!;
}
