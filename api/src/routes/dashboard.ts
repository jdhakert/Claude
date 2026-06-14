import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/guards.js";
import { getDashboard } from "../services/dashboard.js";

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard", { preHandler: requireAuth }, async (request) => {
    return getDashboard(app.db, request.user!.id);
  });
}
