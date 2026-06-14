import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { requireAuth } from "../auth/guards.js";
import { enroll, getCourseTree, listCourses } from "../services/courses.js";
import { completeLesson, getLesson, startLesson } from "../services/lessons.js";
import { hasBetaAccess } from "../services/billing/beta.js";

const AUTHORING_ROLES = ["content_author", "content_reviewer", "admin"];

export async function courseRoutes(app: FastifyInstance): Promise<void> {
  app.get("/courses", { preHandler: requireAuth }, async (request) => ({
    courses: await listCourses(app.db, request.user!.id),
  }));

  app.post(
    "/courses/:courseId/enroll",
    { preHandler: requireAuth },
    async (request) => {
      const { courseId } = request.params as { courseId: string };
      // Beta is invite-only: course access requires beta access.
      if (!(await hasBetaAccess(app.db, request.user!.id)))
        throw new AppError(
          403,
          "beta_required",
          "Course access requires beta access — redeem an invite code first.",
        );
      const result = await enroll(app.db, request.user!.id, courseId);
      if (!result) throw new AppError(404, "not_found", "Course not found.");
      return result;
    },
  );

  app.get(
    "/courses/:courseId",
    { preHandler: requireAuth },
    async (request) => {
      const { courseId } = request.params as { courseId: string };
      const tree = await getCourseTree(app.db, courseId, request.user!.id);
      if (!tree) throw new AppError(404, "not_found", "Course not found.");
      return tree;
    },
  );

  app.get(
    "/lessons/:lessonId",
    { preHandler: requireAuth },
    async (request) => {
      const { lessonId } = request.params as { lessonId: string };
      const query = request.query as { preview?: string };
      const canPreview =
        query.preview === "true" &&
        (request.user?.roles ?? []).some((r) => AUTHORING_ROLES.includes(r));
      const lesson = await getLesson(app.db, lessonId, {
        userId: request.user!.id,
        preview: canPreview,
      });
      if (!lesson)
        throw new AppError(404, "not_found", "Lesson not available.");
      return lesson;
    },
  );

  app.post(
    "/lessons/:lessonId/start",
    { preHandler: requireAuth },
    async (request) => {
      const { lessonId } = request.params as { lessonId: string };
      return startLesson(app.db, request.user!.id, lessonId);
    },
  );

  const CompleteSchema = z.object({
    timeSpentSeconds: z.number().int().min(0).max(86400).default(0),
  });
  app.post(
    "/lessons/:lessonId/complete",
    { preHandler: requireAuth },
    async (request) => {
      const { lessonId } = request.params as { lessonId: string };
      const parsed = CompleteSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw new AppError(400, "bad_request", "Invalid completion payload.");
      }
      return completeLesson(
        app.db,
        request.user!.id,
        lessonId,
        parsed.data.timeSpentSeconds,
      );
    },
  );
}
