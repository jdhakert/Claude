import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { requireRole } from "../auth/guards.js";
import { clearItem, importItem } from "../services/itemsAdmin.js";

// Mandatory licensing metadata is enforced here (Content & Licensing Policy §3).
const ImportSchema = z.object({
  subtopicId: z.string().uuid(),
  primaryIssueId: z.string().uuid().optional(),
  stem: z.string().min(10),
  difficulty: z.number().min(0).max(1).optional(),
  source: z.object({
    name: z.string().min(2),
    provenance: z.enum([
      "original",
      "licensed",
      "public_domain",
      "user_supplied",
    ]),
  }),
  jurisdiction: z.enum([
    "ube",
    "california",
    "mbe",
    "mpre",
    "federal",
    "general",
  ]),
  choices: z
    .array(
      z.object({
        label: z.string().min(1),
        body: z.string().min(1),
        isCorrect: z.boolean(),
        rationale: z.string().optional(),
      }),
    )
    .min(2)
    .refine((cs) => cs.filter((c) => c.isCorrect).length === 1, {
      message: "Exactly one choice must be correct.",
    }),
  explanation: z.string().optional(),
  issueIds: z.array(z.string().uuid()).optional(),
});

export async function itemsAdminRoutes(app: FastifyInstance): Promise<void> {
  // Authors import items (which require source/license metadata).
  app.post(
    "/admin/items",
    { preHandler: requireRole("content_author", "admin") },
    async (request) => {
      const parsed = ImportSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          "missing_license_metadata",
          parsed.error.issues[0]!.message,
        );
      }
      return { item: await importItem(app.db, request.user!.id, parsed.data) };
    },
  );

  // Reviewers clear items for student use (reviewer ≠ author in practice).
  app.post(
    "/admin/items/:id/clear",
    { preHandler: requireRole("content_reviewer", "admin") },
    async (request) => {
      const { id } = request.params as { id: string };
      const item = await clearItem(app.db, request.user!.id, id);
      if (!item) throw new AppError(404, "not_found", "Item not found.");
      return { item };
    },
  );
}
