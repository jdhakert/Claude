import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { requireAuth } from "../auth/guards.js";
import {
  getResults,
  getState,
  pauseSection,
  resumeSection,
  saveAnswer,
  SectionExpiredError,
  startOrResume,
  startSection,
  submitExam,
  submitSection,
} from "../services/exam.js";

export async function examRoutes(app: FastifyInstance): Promise<void> {
  // Start (or resume) an attempt for an exam.
  app.post(
    "/exams/:examId/attempts",
    { preHandler: requireAuth },
    async (request) => {
      const { examId } = request.params as { examId: string };
      const state = await startOrResume(app.db, request.user!.id, examId);
      if (!state) throw new AppError(404, "not_found", "Exam not found.");
      return state;
    },
  );

  // Resume / poll current state (handles accidental refresh + auto-expiry).
  app.get(
    "/exam-attempts/:id",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const state = await getState(app.db, request.user!.id, id);
      if (!state) throw new AppError(404, "not_found", "Attempt not found.");
      return state;
    },
  );

  const sectionBody = z.object({ examSectionId: z.string().uuid() });

  app.post(
    "/exam-attempts/:id/sections/start",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const { examSectionId } = sectionBody.parse(request.body);
      const state = await startSection(
        app.db,
        request.user!.id,
        id,
        examSectionId,
      );
      if (!state) throw new AppError(404, "not_found", "Attempt not found.");
      return state;
    },
  );

  app.post(
    "/exam-attempts/:id/sections/submit",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const { examSectionId } = sectionBody.parse(request.body);
      const state = await submitSection(
        app.db,
        request.user!.id,
        id,
        examSectionId,
      );
      if (!state) throw new AppError(404, "not_found", "Attempt not found.");
      return state;
    },
  );

  app.post(
    "/exam-attempts/:id/sections/pause",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const { examSectionId } = sectionBody.parse(request.body);
      const state = await pauseSection(
        app.db,
        request.user!.id,
        id,
        examSectionId,
      );
      if (!state) throw new AppError(404, "not_found", "Attempt not found.");
      return state;
    },
  );

  app.post(
    "/exam-attempts/:id/sections/resume",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const { examSectionId } = sectionBody.parse(request.body);
      const state = await resumeSection(
        app.db,
        request.user!.id,
        id,
        examSectionId,
      );
      if (!state) throw new AppError(404, "not_found", "Attempt not found.");
      return state;
    },
  );

  const AnswerSchema = z.object({
    attemptItemId: z.string().uuid(),
    selectedChoiceId: z.string().uuid().optional(),
    flagged: z.boolean().optional(),
    timeMsDelta: z.number().int().min(0).max(3_600_000).optional(),
  });
  app.post(
    "/exam-attempts/:id/answer",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = AnswerSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid answer payload.");
      const { attemptItemId, ...patch } = parsed.data;
      try {
        const result = await saveAnswer(
          app.db,
          request.user!.id,
          id,
          attemptItemId,
          patch,
        );
        if (!result) throw new AppError(404, "not_found", "Item not found.");
        return result;
      } catch (err) {
        if (err instanceof SectionExpiredError)
          throw new AppError(409, "section_expired", err.message);
        throw err;
      }
    },
  );

  app.post(
    "/exam-attempts/:id/submit",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const results = await submitExam(app.db, request.user!.id, id);
      if (!results) throw new AppError(404, "not_found", "Attempt not found.");
      return results;
    },
  );

  app.get(
    "/exam-attempts/:id/results",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const results = await getResults(app.db, request.user!.id, id);
      if (!results) throw new AppError(404, "not_found", "Attempt not found.");
      return results;
    },
  );

  // List the course's exams (diagnostic / periodic / full-length).
  app.get("/exams", { preHandler: requireAuth }, async (request) => {
    const { courseId } = request.query as { courseId?: string };
    if (!courseId)
      throw new AppError(400, "bad_request", "courseId is required.");
    const { schema } = await import("@barready/db");
    const { eq, asc } = await import("drizzle-orm");
    const exams = await app.db
      .select({
        id: schema.exams.id,
        kind: schema.exams.kind,
        title: schema.exams.title,
      })
      .from(schema.exams)
      .where(eq(schema.exams.courseId, courseId))
      .orderBy(asc(schema.exams.title));
    return { exams };
  });
}
