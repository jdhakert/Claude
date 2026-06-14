import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import { AppError } from "../errors.js";
import { requireAuth } from "../auth/guards.js";
import {
  addEntry,
  createOutline,
  deleteEntry,
  getOutline,
  listOutlines,
  updateEntry,
} from "../services/retention/outlines.js";

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

export async function outlineRoutes(app: FastifyInstance): Promise<void> {
  app.get("/outlines", { preHandler: requireAuth }, async (request) => {
    const courseId = await currentCourseId(app, request.user!.id);
    if (!courseId) return { outlines: [] };
    return { outlines: await listOutlines(app.db, request.user!.id, courseId) };
  });

  const CreateSchema = z.object({
    title: z.string().min(1).max(200),
    subjectId: z.string().uuid().optional(),
  });
  app.post("/outlines", { preHandler: requireAuth }, async (request) => {
    const parsed = CreateSchema.safeParse(request.body);
    if (!parsed.success)
      throw new AppError(400, "bad_request", "Invalid outline.");
    const courseId = await currentCourseId(app, request.user!.id);
    if (!courseId)
      throw new AppError(409, "no_enrollment", "Enroll in a course first.");
    return {
      outline: await createOutline(app.db, request.user!.id, {
        courseId,
        ...parsed.data,
      }),
    };
  });

  app.get("/outlines/:id", { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await getOutline(app.db, request.user!.id, id);
    if (!result) throw new AppError(404, "not_found", "Outline not found.");
    return result;
  });

  const EntrySchema = z.object({
    issueId: z.string().uuid().optional(),
    rule: z.string().optional(),
    triggerFacts: z.string().optional(),
    commonTraps: z.string().optional(),
    checklist: z.array(z.string()).optional(),
    sortOrder: z.number().int().optional(),
  });
  app.post(
    "/outlines/:id/entries",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = EntrySchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid entry.");
      const entry = await addEntry(app.db, request.user!.id, id, parsed.data);
      if (!entry) throw new AppError(404, "not_found", "Outline not found.");
      return { entry };
    },
  );

  app.patch(
    "/outline-entries/:id",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = EntrySchema.partial().safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid entry.");
      const entry = await updateEntry(
        app.db,
        request.user!.id,
        id,
        parsed.data,
      );
      if (!entry) throw new AppError(404, "not_found", "Entry not found.");
      return { entry };
    },
  );

  app.delete(
    "/outline-entries/:id",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const ok = await deleteEntry(app.db, request.user!.id, id);
      if (!ok) throw new AppError(404, "not_found", "Entry not found.");
      return { ok: true };
    },
  );
}
