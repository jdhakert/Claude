import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import { AppError } from "../errors.js";
import { requireAuth, requireRole } from "../auth/guards.js";
import { studentAnalytics } from "../services/analytics/student.js";
import {
  atRiskStudents,
  cohortOverview,
  commonlyMissedIssues,
  questionDifficulty,
  studentList,
  studentProgress,
} from "../services/analytics/admin.js";

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

async function defaultCourseId(app: FastifyInstance) {
  const row = (
    await app.db.select({ id: schema.courses.id }).from(schema.courses).limit(1)
  )[0];
  return row?.id ?? null;
}

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  // Student's own analytics.
  app.get("/analytics/me", { preHandler: requireAuth }, async (request) => {
    const courseId = await currentCourseId(app, request.user!.id);
    if (!courseId)
      throw new AppError(409, "no_enrollment", "Enroll in a course first.");
    return studentAnalytics(app.db, request.user!.id, courseId);
  });

  const adminGuard = {
    preHandler: requireRole("instructor", "admin"),
  };

  app.get("/admin/analytics/students", adminGuard, async () => ({
    students: await studentList(app.db),
  }));

  app.get("/admin/analytics/cohort", adminGuard, async () =>
    cohortOverview(app.db),
  );

  app.get("/admin/analytics/at-risk", adminGuard, async () => ({
    students: await atRiskStudents(app.db),
  }));

  app.get("/admin/analytics/content", adminGuard, async (request) => {
    const courseId =
      (request.query as { courseId?: string }).courseId ??
      (await defaultCourseId(app));
    if (!courseId) throw new AppError(400, "bad_request", "No course.");
    return {
      questionDifficulty: await questionDifficulty(app.db, courseId),
      commonlyMissedIssues: await commonlyMissedIssues(app.db, courseId),
    };
  });

  app.get("/admin/analytics/students/:id", adminGuard, async (request) => {
    const { id } = request.params as { id: string };
    const courseId = await defaultCourseId(app);
    if (!courseId) throw new AppError(400, "bad_request", "No course.");
    return studentProgress(app.db, id, courseId);
  });
}
