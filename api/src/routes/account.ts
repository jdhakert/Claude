import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { requireAuth } from "../auth/guards.js";
import {
  deleteAccount,
  exportAccount,
  getAccount,
  updateNotifications,
  updateProfile,
} from "../services/account.js";

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get("/account", { preHandler: requireAuth }, async (request) => {
    const account = await getAccount(app.db, request.user!.id);
    if (!account) throw new AppError(404, "not_found", "Account not found.");
    return account;
  });

  const ProfileSchema = z.object({
    displayName: z.string().max(120).optional(),
    examDate: z.string().date().optional(),
    studyHoursPerWeek: z.number().int().min(0).max(80).optional(),
  });
  app.patch(
    "/account/profile",
    { preHandler: requireAuth },
    async (request) => {
      const parsed = ProfileSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid profile.");
      return updateProfile(app.db, request.user!.id, parsed.data);
    },
  );

  const NotifSchema = z.object({ prefs: z.record(z.string(), z.boolean()) });
  app.patch(
    "/account/notifications",
    { preHandler: requireAuth },
    async (request) => {
      const parsed = NotifSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid preferences.");
      return updateNotifications(app.db, request.user!.id, parsed.data.prefs);
    },
  );

  // Privacy: export all of my personal data.
  app.get("/account/export", { preHandler: requireAuth }, async (request) => {
    const data = await exportAccount(app.db, request.user!.id);
    if (!data) throw new AppError(404, "not_found", "Account not found.");
    return data;
  });

  // Privacy: permanently delete my account (requires explicit confirmation).
  const DeleteSchema = z.object({ confirm: z.literal(true) });
  app.delete(
    "/account",
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = DeleteSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "confirmation_required", "Confirm deletion.");
      const ok = await deleteAccount(app.db, request.user!.id);
      if (!ok) throw new AppError(404, "not_found", "Account not found.");
      reply.clearCookie("br_session", { path: "/" });
      return { deleted: true };
    },
  );
}
