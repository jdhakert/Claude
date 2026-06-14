import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import { AppError } from "../errors.js";
import { requireAuth } from "../auth/guards.js";
import { redFlagReview, wrongAnswerPatterns } from "../services/insights.js";
import { buildRemediationSet } from "../services/remediation.js";

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

export async function featureRoutes(app: FastifyInstance): Promise<void> {
  // Wrong Answer Pattern Detector.
  app.get("/insights/patterns", { preHandler: requireAuth }, async (request) =>
    wrongAnswerPatterns(app.db, request.user!.id),
  );

  // Red Flag Review (pre-exam briefing).
  app.get(
    "/insights/red-flags",
    { preHandler: requireAuth },
    async (request) => {
      const courseId = await currentCourseId(app, request.user!.id);
      if (!courseId)
        throw new AppError(409, "no_enrollment", "Enroll in a course first.");
      return redFlagReview(app.db, request.user!.id, courseId);
    },
  );

  // Smart Remediation Set.
  app.get("/remediation/set", { preHandler: requireAuth }, async (request) => {
    const courseId = await currentCourseId(app, request.user!.id);
    if (!courseId)
      throw new AppError(409, "no_enrollment", "Enroll in a course first.");
    const q = request.query as { issueId?: string; limit?: string };
    return buildRemediationSet(app.db, request.user!.id, courseId, {
      issueId: q.issueId,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  });
}
