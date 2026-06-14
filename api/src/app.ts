import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppDb } from "./db.js";
import { loadEnv, type Env } from "./env.js";
import { registerErrorHandler } from "./errors.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import { adminRoutes } from "./routes/admin.js";
import { ensureBaseRoles } from "./services/roles.js";

export interface BuildAppOptions {
  env?: Env;
  /** Database is optional: without it the API runs health-only. */
  db?: AppDb;
}

/**
 * Build a configured Fastify instance (logging, error handling, routes).
 * Exported so tests can exercise it via `app.inject` without a network port.
 */
export async function buildApp(
  opts: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const env = opts.env ?? loadEnv();

  const app = Fastify({
    logger:
      env.NODE_ENV === "test"
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: ["req.headers.authorization", "req.headers.cookie"],
          },
    disableRequestLogging: env.NODE_ENV === "test",
  });

  await app.register(cookie);
  app.decorateRequest("user", null);
  registerErrorHandler(app);
  await app.register(healthRoutes);

  if (opts.db) {
    app.decorate("db", opts.db);
    await ensureBaseRoles(opts.db);
    await app.register(authRoutes);
    await app.register(onboardingRoutes);
    await app.register(adminRoutes);
  } else {
    app.log?.warn("No database configured — running health-only.");
  }

  return app;
}
