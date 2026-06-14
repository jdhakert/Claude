import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { asc } from "drizzle-orm";
import { schema } from "@barready/db";
import { AppError } from "../errors.js";
import { requireRole } from "../auth/guards.js";
import { getCourseTree } from "../services/courses.js";
import {
  createBlock,
  createCourse,
  createLesson,
  createModule,
  deleteBlock,
  updateBlock,
  updateCourse,
  updateLesson,
  updateModule,
} from "../services/authoring.js";

const BLOCK_KINDS = [
  "text",
  "checklist",
  "rule_statement",
  "example",
  "mini_quiz",
  "video",
  "outline_download",
  "callout",
] as const;

function parse<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new AppError(
      400,
      "bad_request",
      r.error.issues[0]?.message ?? "Invalid input.",
    );
  }
  return r.data;
}

export async function authoringRoutes(app: FastifyInstance): Promise<void> {
  const guard = { preHandler: requireRole("content_author", "admin") };

  // List all courses (authoring view).
  app.get("/admin/courses", guard, async () => ({
    courses: await app.db
      .select()
      .from(schema.courses)
      .orderBy(asc(schema.courses.title)),
  }));

  // Full editable tree including not-yet-cleared lessons.
  app.get("/admin/courses/:courseId/tree", guard, async (request) => {
    const { courseId } = request.params as { courseId: string };
    const tree = await getCourseTree(app.db, courseId, request.user!.id, {
      includeUncleared: true,
    });
    if (!tree) throw new AppError(404, "not_found", "Course not found.");
    return tree;
  });

  app.post("/admin/courses", guard, async (request) => {
    const data = parse(
      z.object({
        slug: z.string().min(2),
        title: z.string().min(2),
        type: z.enum(["ube", "california", "mbe_only", "essay_only", "mpre"]),
        jurisdiction: z.enum([
          "ube",
          "california",
          "mbe",
          "mpre",
          "federal",
          "general",
        ]),
        description: z.string().optional(),
      }),
      request.body,
    );
    return { course: await createCourse(app.db, data) };
  });

  app.patch("/admin/courses/:id", guard, async (request) => {
    const { id } = request.params as { id: string };
    const data = parse(
      z.object({
        title: z.string().min(2).optional(),
        description: z.string().optional(),
      }),
      request.body,
    );
    const course = await updateCourse(app.db, id, data);
    if (!course) throw new AppError(404, "not_found", "Course not found.");
    return { course };
  });

  app.post("/admin/courses/:courseId/modules", guard, async (request) => {
    const { courseId } = request.params as { courseId: string };
    const data = parse(
      z.object({
        title: z.string().min(2),
        sortOrder: z.number().int().optional(),
      }),
      request.body,
    );
    return { module: await createModule(app.db, { courseId, ...data }) };
  });

  app.patch("/admin/modules/:id", guard, async (request) => {
    const { id } = request.params as { id: string };
    const data = parse(
      z.object({
        title: z.string().min(2).optional(),
        sortOrder: z.number().int().optional(),
      }),
      request.body,
    );
    const module = await updateModule(app.db, id, data);
    if (!module) throw new AppError(404, "not_found", "Module not found.");
    return { module };
  });

  app.post("/admin/modules/:moduleId/lessons", guard, async (request) => {
    const { moduleId } = request.params as { moduleId: string };
    const data = parse(
      z.object({
        title: z.string().min(2),
        subtopicId: z.string().uuid().optional(),
        sortOrder: z.number().int().optional(),
        jurisdiction: z
          .enum(["ube", "california", "mbe", "mpre", "federal", "general"])
          .optional(),
      }),
      request.body,
    );
    return {
      lesson: await createLesson(app.db, request.user!.id, {
        moduleId,
        ...data,
      }),
    };
  });

  app.patch("/admin/lessons/:id", guard, async (request) => {
    const { id } = request.params as { id: string };
    const data = parse(
      z.object({
        title: z.string().min(2).optional(),
        sortOrder: z.number().int().optional(),
      }),
      request.body,
    );
    const lesson = await updateLesson(app.db, id, data);
    if (!lesson) throw new AppError(404, "not_found", "Lesson not found.");
    return { lesson };
  });

  app.post("/admin/lessons/:lessonId/blocks", guard, async (request) => {
    const { lessonId } = request.params as { lessonId: string };
    const data = parse(
      z.object({
        kind: z.enum(BLOCK_KINDS),
        body: z.record(z.string(), z.unknown()),
        sortOrder: z.number().int().optional(),
      }),
      request.body,
    );
    return { block: await createBlock(app.db, { lessonId, ...data }) };
  });

  app.patch("/admin/blocks/:id", guard, async (request) => {
    const { id } = request.params as { id: string };
    const data = parse(
      z.object({
        kind: z.enum(BLOCK_KINDS).optional(),
        body: z.record(z.string(), z.unknown()).optional(),
        sortOrder: z.number().int().optional(),
      }),
      request.body,
    );
    const block = await updateBlock(app.db, id, data);
    if (!block) throw new AppError(404, "not_found", "Block not found.");
    return { block };
  });

  app.delete("/admin/blocks/:id", guard, async (request) => {
    const { id } = request.params as { id: string };
    await deleteBlock(app.db, id);
    return { ok: true };
  });
}
