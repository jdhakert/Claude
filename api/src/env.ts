import { z } from "zod";

/**
 * Environment validation (Charter §2/§3): all config comes from the environment
 * and is validated at startup. Invalid/missing config fails fast and loud.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  // Optional in dev/test; required before the API talks to a database.
  DATABASE_URL: z.string().url().optional(),
  // Comma-separated allowed origins for CORS (deny-by-default elsewhere).
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
