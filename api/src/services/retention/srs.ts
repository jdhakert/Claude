import { and, asc, eq, lte } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../../db.js";
import { schedule, type Rating } from "./scheduler.js";

type Jurisdiction =
  | "ube"
  | "california"
  | "mbe"
  | "mpre"
  | "federal"
  | "general";

async function userSourceId(db: AppDb): Promise<string> {
  const name = "User Generated";
  const existing = (
    await db
      .select({ id: schema.contentSources.id })
      .from(schema.contentSources)
      .where(eq(schema.contentSources.name, name))
      .limit(1)
  )[0];
  if (existing) return existing.id;
  return (
    await db
      .insert(schema.contentSources)
      .values({ name, provenance: "user_supplied" })
      .returning()
  )[0]!.id;
}

/**
 * Create a flashcard and schedule it for review immediately (due now).
 * `kind` is informational; manual / from-miss / rule / issue all become cards.
 */
export async function createCard(
  db: AppDb,
  userId: string,
  input: {
    front: string;
    back: string;
    issueId?: string;
    jurisdiction?: Jurisdiction;
  },
) {
  const sourceId = await userSourceId(db);
  const card = (
    await db
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
      .returning()
  )[0]!;

  await db.insert(schema.srsReviews).values({
    userId,
    flashcardId: card.id,
    issueId: input.issueId ?? null,
    dueAt: new Date(), // available immediately
  });
  return card;
}

/** Due cards (flashcards + rule cards), with their front/back content. */
export async function listDue(db: AppDb, userId: string) {
  const reviews = await db
    .select()
    .from(schema.srsReviews)
    .where(
      and(
        eq(schema.srsReviews.userId, userId),
        lte(schema.srsReviews.dueAt, new Date()),
      ),
    )
    .orderBy(asc(schema.srsReviews.dueAt));

  const cards = [];
  for (const r of reviews) {
    let front = "";
    let back = "";
    if (r.flashcardId) {
      const fc = (
        await db
          .select({
            front: schema.flashcards.front,
            back: schema.flashcards.back,
          })
          .from(schema.flashcards)
          .where(eq(schema.flashcards.id, r.flashcardId))
          .limit(1)
      )[0];
      front = fc?.front ?? "";
      back = fc?.back ?? "";
    } else if (r.ruleId) {
      const rule = (
        await db
          .select()
          .from(schema.rules)
          .where(eq(schema.rules.id, r.ruleId))
          .limit(1)
      )[0];
      front = "State the rule.";
      back = rule?.statement ?? "";
    }
    cards.push({
      reviewId: r.id,
      stage: r.stage,
      front,
      back,
      isRule: Boolean(r.ruleId),
    });
  }
  return cards;
}

/** Apply a review rating: reschedule (deterministic), log, and bump progress. */
export async function review(
  db: AppDb,
  userId: string,
  reviewId: string,
  rating: Rating,
) {
  const r = (
    await db
      .select()
      .from(schema.srsReviews)
      .where(eq(schema.srsReviews.id, reviewId))
      .limit(1)
  )[0];
  if (!r || r.userId !== userId) return null;

  const next = schedule(
    {
      intervalDays: r.intervalDays,
      ease: r.ease,
      reps: r.reps,
      lapses: r.lapses,
    },
    rating,
  );
  const dueAt = new Date(Date.now() + next.dueInMinutes * 60 * 1000);

  await db
    .update(schema.srsReviews)
    .set({
      intervalDays: next.intervalDays,
      ease: next.ease,
      reps: next.reps,
      lapses: next.lapses,
      dueAt,
      lastRating: rating,
      lastReviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.srsReviews.id, reviewId));

  await db.insert(schema.srsReviewLogs).values({
    srsReviewId: reviewId,
    userId,
    rating,
    wasCorrect: next.wasCorrect,
    intervalDays: next.intervalDays,
    stage: r.stage,
  });

  await db.insert(schema.learningEvents).values({
    userId,
    type: "review_completed",
    payload: { reviewId, rating, wasCorrect: next.wasCorrect },
  });

  // Retention activity affects progress: successful recall nudges issue mastery.
  if (r.issueId && next.wasCorrect) {
    const courseRow = (
      await db
        .select({ courseId: schema.subjects.courseId })
        .from(schema.issues)
        .innerJoin(
          schema.subtopics,
          eq(schema.issues.subtopicId, schema.subtopics.id),
        )
        .innerJoin(
          schema.subjects,
          eq(schema.subtopics.subjectId, schema.subjects.id),
        )
        .where(eq(schema.issues.id, r.issueId))
        .limit(1)
    )[0];
    if (courseRow) {
      const latest = (
        await db
          .select({ mastery: schema.progressSnapshots.mastery })
          .from(schema.progressSnapshots)
          .where(
            and(
              eq(schema.progressSnapshots.userId, userId),
              eq(schema.progressSnapshots.level, "issue"),
              eq(schema.progressSnapshots.refId, r.issueId),
            ),
          )
          .orderBy(asc(schema.progressSnapshots.capturedAt))
          .limit(1)
      )[0];
      const prev = latest?.mastery ?? 0.3;
      const bump = rating === "easy" ? 0.1 : 0.05;
      await db.insert(schema.progressSnapshots).values({
        userId,
        courseId: courseRow.courseId,
        level: "issue",
        refId: r.issueId,
        mastery: Math.min(1, prev + bump),
        recency: 1,
      });
    }
  }

  return { reviewId, ...next, dueAt: dueAt.toISOString() };
}

/** Find or create the SRS review row for a rule card, then return its id. */
export async function ensureRuleReview(
  db: AppDb,
  userId: string,
  ruleId: string,
): Promise<string | null> {
  const rule = (
    await db
      .select()
      .from(schema.rules)
      .where(eq(schema.rules.id, ruleId))
      .limit(1)
  )[0];
  if (!rule) return null;
  const existing = (
    await db
      .select({ id: schema.srsReviews.id })
      .from(schema.srsReviews)
      .where(
        and(
          eq(schema.srsReviews.userId, userId),
          eq(schema.srsReviews.ruleId, ruleId),
        ),
      )
      .limit(1)
  )[0];
  if (existing) return existing.id;
  return (
    await db
      .insert(schema.srsReviews)
      .values({ userId, ruleId, issueId: rule.issueId, dueAt: new Date() })
      .returning()
  )[0]!.id;
}

/** Overall recall accuracy + recent review history. */
export async function recallStats(db: AppDb, userId: string) {
  const logs = await db
    .select()
    .from(schema.srsReviewLogs)
    .where(eq(schema.srsReviewLogs.userId, userId))
    .orderBy(asc(schema.srsReviewLogs.reviewedAt));
  const total = logs.length;
  const correct = logs.filter((l) => l.wasCorrect).length;
  return {
    totalReviews: total,
    accuracy: total ? correct / total : null,
    history: logs.slice(-20).map((l) => ({
      rating: l.rating,
      wasCorrect: l.wasCorrect,
      reviewedAt: l.reviewedAt.toISOString(),
    })),
  };
}
