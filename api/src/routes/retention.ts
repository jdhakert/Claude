import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import { AppError } from "../errors.js";
import { requireAuth } from "../auth/guards.js";
import {
  createCard,
  ensureRuleReview,
  listDue,
  recallStats,
  review,
} from "../services/retention/srs.js";
import { listRules } from "../services/retention/rules.js";

const RATINGS = ["again", "hard", "good", "easy"] as const;

async function currentCourseId(app: FastifyInstance, userId: string) {
  const row = (
    await app.db
      .select({ courseId: schema.enrollments.courseId })
      .from(schema.enrollments)
      .where(eq(schema.enrollments.userId, userId))
      .orderBy(desc(schema.enrollments.createdAt))
      .limit(1)
  )[0];
  return row?.courseId ?? null;
}

export async function retentionRoutes(app: FastifyInstance): Promise<void> {
  // Due review queue.
  app.get("/srs/due", { preHandler: requireAuth }, async (request) => ({
    cards: await listDue(app.db, request.user!.id),
  }));

  app.get("/srs/stats", { preHandler: requireAuth }, async (request) =>
    recallStats(app.db, request.user!.id),
  );

  // Create a flashcard (manual / issue / rule card) → scheduled immediately.
  const CardSchema = z.object({
    front: z.string().min(1).max(2000),
    back: z.string().min(1).max(4000),
    issueId: z.string().uuid().optional(),
  });
  app.post("/srs/cards", { preHandler: requireAuth }, async (request) => {
    const parsed = CardSchema.safeParse(request.body);
    if (!parsed.success)
      throw new AppError(400, "bad_request", "Invalid card.");
    return { card: await createCard(app.db, request.user!.id, parsed.data) };
  });

  // Review a due card with a rating.
  const ReviewSchema = z.object({ rating: z.enum(RATINGS) });
  app.post(
    "/srs/:reviewId/review",
    { preHandler: requireAuth },
    async (request) => {
      const { reviewId } = request.params as { reviewId: string };
      const parsed = ReviewSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid rating.");
      const result = await review(
        app.db,
        request.user!.id,
        reviewId,
        parsed.data.rating,
      );
      if (!result) throw new AppError(404, "not_found", "Review not found.");
      return result;
    },
  );

  // Rule memorization: list rules for drills.
  app.get("/rules", { preHandler: requireAuth }, async (request) => {
    const courseId =
      (request.query as { courseId?: string }).courseId ??
      (await currentCourseId(app, request.user!.id));
    if (!courseId) throw new AppError(400, "bad_request", "courseId required.");
    return { rules: await listRules(app.db, courseId) };
  });

  // Record a rule drill (active recall) — schedules the rule card.
  app.post(
    "/rules/:ruleId/drill",
    { preHandler: requireAuth },
    async (request) => {
      const { ruleId } = request.params as { ruleId: string };
      const parsed = ReviewSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid rating.");
      const reviewId = await ensureRuleReview(app.db, request.user!.id, ruleId);
      if (!reviewId) throw new AppError(404, "not_found", "Rule not found.");
      return review(app.db, request.user!.id, reviewId, parsed.data.rating);
    },
  );
}
