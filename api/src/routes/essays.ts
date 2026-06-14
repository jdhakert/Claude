import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { schema } from "@barready/db";
import { eq } from "drizzle-orm";
import { AppError } from "../errors.js";
import { requireAuth, requireRole } from "../auth/guards.js";
import {
  essayAnalytics,
  getEssayPrompt,
  getSubmission,
  gradeSubmission,
  listEssayPrompts,
  listForGrading,
  selfAssess,
  submitEssay,
} from "../services/essays.js";
import { getFeedbackProvider } from "../services/grading/aiFeedback.js";

export async function essayRoutes(app: FastifyInstance): Promise<void> {
  app.get("/essays", { preHandler: requireAuth }, async (request) => {
    const { courseId } = request.query as { courseId?: string };
    if (!courseId)
      throw new AppError(400, "bad_request", "courseId is required.");
    return { prompts: await listEssayPrompts(app.db, courseId) };
  });

  app.get("/essays/analytics", { preHandler: requireAuth }, async (request) => {
    return essayAnalytics(app.db, request.user!.id);
  });

  app.get("/essays/:id", { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const prompt = await getEssayPrompt(app.db, id);
    if (!prompt) throw new AppError(404, "not_found", "Essay not available.");
    return prompt;
  });

  const SubmitSchema = z.object({
    responseText: z.string().min(1).max(50000),
    timeSpentSeconds: z.number().int().min(0).max(86400),
  });
  app.post(
    "/essays/:id/submissions",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = SubmitSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid essay submission.");
      const result = await submitEssay(
        app.db,
        request.user!.id,
        id,
        parsed.data,
      );
      if (!result) throw new AppError(404, "not_found", "Essay not available.");
      return result;
    },
  );

  const SelfAssessSchema = z.object({
    scores: z.array(
      z.object({
        dimension: z.string(),
        score: z.number().int().min(0).max(5),
      }),
    ),
    spottedIssueIds: z.array(z.string().uuid()).default([]),
  });
  app.post(
    "/essay-submissions/:id/self-assessment",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = SelfAssessSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid self-assessment.");
      const result = await selfAssess(
        app.db,
        request.user!.id,
        id,
        parsed.data,
      );
      if (!result)
        throw new AppError(404, "not_found", "Submission not found.");
      return result;
    },
  );

  app.get(
    "/essay-submissions/:id",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const sub = await getSubmission(app.db, id);
      if (!sub) throw new AppError(404, "not_found", "Submission not found.");
      // Students may only see their own; graders/admins may see any.
      const roles = request.user?.roles ?? [];
      const privileged = roles.some((r) =>
        ["grader", "instructor", "admin"].includes(r),
      );
      if (sub.userId !== request.user!.id && !privileged)
        throw new AppError(403, "forbidden", "Not your submission.");
      return { submission: sub };
    },
  );

  // AI-feedback seam — disabled in beta (abstraction only).
  app.post(
    "/essay-submissions/:id/ai-feedback",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const sub = await getSubmission(app.db, id);
      if (!sub) throw new AppError(404, "not_found", "Submission not found.");
      const prompt = (
        await app.db
          .select()
          .from(schema.essayPrompts)
          .where(eq(schema.essayPrompts.id, sub.essayPromptId))
          .limit(1)
      )[0]!;
      const provider = getFeedbackProvider();
      const feedback = await provider.generate({
        prompt: prompt.prompt,
        modelAnswer: prompt.modelAnswer,
        responseText: sub.responseText,
        rubricDimensions: sub.selfScores.map((s) => s.dimension),
      });
      return { provider: provider.name, enabled: provider.enabled, feedback };
    },
  );

  // --- Grader / admin ---
  const gradeGuard = {
    preHandler: requireRole("grader", "instructor", "admin"),
  };

  app.get("/grader/essay-submissions", gradeGuard, async () => ({
    submissions: await listForGrading(app.db),
  }));

  const GradeSchema = z.object({
    scores: z.array(
      z.object({
        dimension: z.string(),
        score: z.number().int().min(0).max(5),
        notes: z.string().optional(),
      }),
    ),
    comment: z.string().max(5000).optional(),
    missedIssueIds: z.array(z.string().uuid()).optional(),
    ruleWeaknesses: z.array(z.string()).optional(),
  });
  app.post(
    "/grader/essay-submissions/:id/grade",
    gradeGuard,
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = GradeSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid grade payload.");
      const result = await gradeSubmission(
        app.db,
        request.user!.id,
        id,
        parsed.data,
      );
      if (!result)
        throw new AppError(404, "not_found", "Submission not found.");
      return { submission: result };
    },
  );
}
