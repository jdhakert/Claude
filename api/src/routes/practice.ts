import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { requireAuth } from "../auth/guards.js";
import {
  getPracticeItems,
  getPracticeTaxonomy,
  submitAttempt,
} from "../services/practice.js";
import { addErrorJournal, createFlashcard } from "../services/journal.js";

export async function practiceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/practice/taxonomy",
    { preHandler: requireAuth },
    async (request) => {
      const { courseId } = request.query as { courseId?: string };
      if (!courseId)
        throw new AppError(400, "bad_request", "courseId is required.");
      return { subjects: await getPracticeTaxonomy(app.db, courseId) };
    },
  );

  app.get("/practice/items", { preHandler: requireAuth }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    if (!q.courseId)
      throw new AppError(400, "bad_request", "courseId is required.");
    const items = await getPracticeItems(app.db, {
      courseId: q.courseId,
      subjectId: q.subjectId,
      subtopicId: q.subtopicId,
      mixed: q.mixed === "true",
      limit: q.limit ? Number(q.limit) : 10,
    });
    return { items };
  });

  const AttemptSchema = z.object({
    itemId: z.string().uuid(),
    selectedChoiceId: z.string().uuid(),
    confidence: z.enum(["guessing", "low", "medium", "high"]),
    timeMs: z.number().int().min(0).max(3_600_000),
    mode: z.enum(["tutor", "timed", "exam", "diagnostic"]).default("tutor"),
  });
  app.post(
    "/practice/attempts",
    { preHandler: requireAuth },
    async (request) => {
      const parsed = AttemptSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "bad_request", parsed.error.issues[0]!.message);
      }
      const review = await submitAttempt(app.db, request.user!.id, parsed.data);
      if (!review) throw new AppError(404, "not_found", "Item not available.");
      return review;
    },
  );

  const JournalSchema = z.object({
    questionAttemptId: z.string().uuid().optional(),
    issueId: z.string().uuid().optional(),
    cause: z.enum([
      "didnt_know_rule",
      "misread_facts",
      "wrong_issue_spotted",
      "rule_misapplied",
      "timing_rushed",
      "careless",
      "trap_distractor",
    ]),
    note: z.string().max(1000).optional(),
  });
  app.post("/error-journal", { preHandler: requireAuth }, async (request) => {
    const parsed = JournalSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "bad_request", "Invalid error-journal entry.");
    }
    return {
      entry: await addErrorJournal(app.db, request.user!.id, parsed.data),
    };
  });

  const FlashcardSchema = z.object({
    issueId: z.string().uuid().optional(),
    front: z.string().min(1).max(2000),
    back: z.string().min(1).max(4000),
  });
  app.post("/flashcards", { preHandler: requireAuth }, async (request) => {
    const parsed = FlashcardSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "bad_request", "Invalid flashcard.");
    }
    return {
      flashcard: await createFlashcard(app.db, request.user!.id, parsed.data),
    };
  });
}
