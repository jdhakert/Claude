import type { FastifyInstance } from "fastify";
import { requireRole } from "../auth/guards.js";
import { listUsers } from "../services/users.js";

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Admin-only: view all users and their roles (Phase 6 acceptance).
  app.get("/admin/users", { preHandler: requireRole("admin") }, async () => ({
    users: await listUsers(app.db),
  }));
}
