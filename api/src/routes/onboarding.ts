import type { FastifyInstance } from "fastify";
import { AppError } from "../errors.js";
import { requireAuth } from "../auth/guards.js";
import {
  getProfile,
  OnboardingSchema,
  saveOnboarding,
} from "../services/onboarding.js";

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/onboarding", { preHandler: requireAuth }, async (request) => ({
    profile: await getProfile(app.db, request.user!.id),
  }));

  app.post("/onboarding", { preHandler: requireAuth }, async (request) => {
    const parsed = OnboardingSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        "bad_request",
        parsed.error.issues[0]?.message ?? "Invalid onboarding data.",
      );
    }
    const profile = await saveOnboarding(app.db, request.user!.id, parsed.data);
    return { profile };
  });
}
