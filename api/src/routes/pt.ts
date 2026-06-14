import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { requireAuth, requireRole } from "../auth/guards.js";
import {
  getPtSubmission,
  getPtTask,
  gradePt,
  listPtForGrading,
  listPtTasks,
  ptAnalytics,
  selfAssessPt,
  submitPt,
} from "../services/pt.js";

export async function ptRoutes(app: FastifyInstance): Promise<void> {
  app.get("/pt-tasks", { preHandler: requireAuth }, async (request) => {
    const { courseId } = request.query as { courseId?: string };
    if (!courseId)
      throw new AppError(400, "bad_request", "courseId is required.");
    return { tasks: await listPtTasks(app.db, courseId) };
  });

  app.get("/pt/analytics", { preHandler: requireAuth }, async (request) =>
    ptAnalytics(app.db, request.user!.id),
  );

  app.get("/pt-tasks/:id", { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const task = await getPtTask(app.db, id);
    if (!task) throw new AppError(404, "not_found", "PT task not available.");
    return task;
  });

  const SubmitSchema = z.object({
    responseText: z.string().min(1).max(100000),
    timeSpentSeconds: z.number().int().min(0).max(86400),
  });
  app.post(
    "/pt-tasks/:id/submissions",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = SubmitSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid PT submission.");
      const result = await submitPt(app.db, request.user!.id, id, parsed.data);
      if (!result)
        throw new AppError(404, "not_found", "PT task not available.");
      return result;
    },
  );

  const SelfSchema = z.object({
    scores: z.array(
      z.object({
        dimension: z.string(),
        score: z.number().int().min(0).max(5),
      }),
    ),
  });
  app.post(
    "/pt-submissions/:id/self-assessment",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = SelfSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid self-assessment.");
      const result = await selfAssessPt(
        app.db,
        request.user!.id,
        id,
        parsed.data.scores,
      );
      if (!result)
        throw new AppError(404, "not_found", "Submission not found.");
      return result;
    },
  );

  app.get(
    "/pt-submissions/:id",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const sub = await getPtSubmission(app.db, id);
      if (!sub) throw new AppError(404, "not_found", "Submission not found.");
      const roles = request.user?.roles ?? [];
      const privileged = roles.some((r) =>
        ["grader", "instructor", "admin"].includes(r),
      );
      if (sub.userId !== request.user!.id && !privileged)
        throw new AppError(403, "forbidden", "Not your submission.");
      return { submission: sub };
    },
  );

  const gradeGuard = {
    preHandler: requireRole("grader", "instructor", "admin"),
  };

  app.get("/grader/pt-submissions", gradeGuard, async () => ({
    submissions: await listPtForGrading(app.db),
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
    ruleWeaknesses: z.array(z.string()).optional(),
  });
  app.post("/grader/pt-submissions/:id/grade", gradeGuard, async (request) => {
    const { id } = request.params as { id: string };
    const parsed = GradeSchema.safeParse(request.body);
    if (!parsed.success)
      throw new AppError(400, "bad_request", "Invalid grade payload.");
    const result = await gradePt(app.db, request.user!.id, id, parsed.data);
    if (!result) throw new AppError(404, "not_found", "Submission not found.");
    return { submission: result };
  });
}
