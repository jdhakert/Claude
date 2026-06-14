import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppDb } from "./db.js";
import { loadEnv, type Env } from "./env.js";
import { registerErrorHandler } from "./errors.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import { adminRoutes } from "./routes/admin.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { courseRoutes } from "./routes/courses.js";
import { authoringRoutes } from "./routes/authoring.js";
import { practiceRoutes } from "./routes/practice.js";
import { itemsAdminRoutes } from "./routes/itemsAdmin.js";
import { examRoutes } from "./routes/exam.js";
import { essayRoutes } from "./routes/essays.js";
import { ptRoutes } from "./routes/pt.js";
import { planRoutes } from "./routes/plan.js";
import { retentionRoutes } from "./routes/retention.js";
import { outlineRoutes } from "./routes/outlines.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { featureRoutes } from "./routes/features.js";
import { cmsRoutes } from "./routes/cms.js";
import { billingRoutes } from "./routes/billing.js";
import { accountRoutes } from "./routes/account.js";
import { ensureBaseRoles } from "./services/roles.js";

export interface BuildAppOptions {
  env?: Env;
  /** Database is optional: without it the API runs health-only. */
  db?: AppDb;
  /**
   * Max auth attempts (login/signup) per IP per minute. Defaults to 20 in
   * non-test environments and 0 (disabled) under test so suites can hammer
   * login; a dedicated test passes a low value to exercise the limiter.
   */
  authRateLimitMax?: number;
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

  // Security headers (Charter §3). The API serves JSON, so CSP is unneeded;
  // helmet still sets nosniff, frameguard, referrer-policy, HSTS, etc.
  await app.register(helmet, { contentSecurityPolicy: false });

  // CORS with credentials so the browser PWA can send the session cookie
  // cross-origin (client :5173 → API :3000). Origins come from validated env.
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()),
    credentials: true,
  });
  await app.register(cookie);
  app.decorateRequest("user", null);
  registerErrorHandler(app);
  await app.register(healthRoutes);

  const authRateLimitMax =
    opts.authRateLimitMax ?? (env.NODE_ENV === "test" ? 0 : 20);

  if (opts.db) {
    app.decorate("db", opts.db);
    await ensureBaseRoles(opts.db);
    await app.register(authRoutes, { authRateLimitMax });
    await app.register(onboardingRoutes);
    await app.register(adminRoutes);
    await app.register(dashboardRoutes);
    await app.register(courseRoutes);
    await app.register(authoringRoutes);
    await app.register(practiceRoutes);
    await app.register(itemsAdminRoutes);
    await app.register(examRoutes);
    await app.register(essayRoutes);
    await app.register(ptRoutes);
    await app.register(planRoutes);
    await app.register(retentionRoutes);
    await app.register(outlineRoutes);
    await app.register(analyticsRoutes);
    await app.register(featureRoutes);
    await app.register(cmsRoutes);
    await app.register(billingRoutes);
    await app.register(accountRoutes);
  } else {
    app.log?.warn("No database configured — running health-only.");
  }

  return app;
}
