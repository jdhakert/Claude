import Fastify, { type FastifyInstance } from "fastify";
import { loadEnv, type Env } from "./env.js";
import { registerErrorHandler } from "./errors.js";
import { healthRoutes } from "./routes/health.js";

export interface BuildAppOptions {
  env?: Env;
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
    // Structured logging baseline (pino under the hood). Silent in tests.
    logger:
      env.NODE_ENV === "test"
        ? false
        : {
            level: env.LOG_LEVEL,
            // Never log secrets/PII (Charter §3).
            redact: ["req.headers.authorization", "req.headers.cookie"],
          },
    disableRequestLogging: env.NODE_ENV === "test",
  });

  registerErrorHandler(app);
  await app.register(healthRoutes);

  return app;
}
