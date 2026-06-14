import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import { AppError } from "../errors.js";
import { requireAuth } from "../auth/guards.js";
import { generateDailyPlan } from "../services/adaptive/planner.js";

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

export async function planRoutes(app: FastifyInstance): Promise<void> {
  const GenerateSchema = z.object({
    minutesOverride: z.number().int().min(5).max(720).optional(),
    date: z.string().date().optional(),
  });

  // Generate (and store) today's adaptive plan from current signals.
  app.post("/plan/generate", { preHandler: requireAuth }, async (request) => {
    const parsed = GenerateSchema.safeParse(request.body ?? {});
    if (!parsed.success)
      throw new AppError(400, "bad_request", "Invalid plan options.");
    const courseId = await currentCourseId(app, request.user!.id);
    if (!courseId)
      throw new AppError(409, "no_enrollment", "Enroll in a course first.");
    return generateDailyPlan(app.db, request.user!.id, courseId, parsed.data);
  });

  // Fetch the most recent stored plan with its blocks.
  app.get("/plan/today", { preHandler: requireAuth }, async (request) => {
    const assignment = (
      await app.db
        .select()
        .from(schema.assignments)
        .where(eq(schema.assignments.userId, request.user!.id))
        .orderBy(desc(schema.assignments.forDate))
        .limit(1)
    )[0];
    if (!assignment) return { assignment: null, blocks: [] };
    const blocks = await app.db
      .select()
      .from(schema.assignmentItems)
      .where(eq(schema.assignmentItems.assignmentId, assignment.id))
      .orderBy(schema.assignmentItems.sortOrder);
    return { assignment, blocks };
  });

  // Mark a block done (assignments are trackable).
  app.post(
    "/plan/items/:id/complete",
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      // Ensure the block belongs to the user before mutating.
      const owned = (
        await app.db
          .select({ id: schema.assignmentItems.id })
          .from(schema.assignmentItems)
          .innerJoin(
            schema.assignments,
            eq(schema.assignmentItems.assignmentId, schema.assignments.id),
          )
          .where(
            and(
              eq(schema.assignmentItems.id, id),
              eq(schema.assignments.userId, request.user!.id),
            ),
          )
          .limit(1)
      )[0];
      if (!owned) throw new AppError(404, "not_found", "Block not found.");
      await app.db
        .update(schema.assignmentItems)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(schema.assignmentItems.id, id));
      return { ok: true };
    },
  );
}
