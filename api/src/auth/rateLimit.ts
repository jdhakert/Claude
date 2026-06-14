import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors.js";

/**
 * Minimal in-memory fixed-window rate limiter for sensitive endpoints
 * (login/signup/redeem). Keyed by client IP + route. Beta-scale; a distributed
 * store (e.g. Redis) is the post-beta upgrade. Returns 429 when exceeded.
 */
export function makeRateLimiter(opts: { max: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return async function rateLimit(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (opts.max <= 0) return; // disabled
    const key = `${request.ip}:${request.routeOptions?.url ?? request.url}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return;
    }
    entry.count += 1;
    if (entry.count > opts.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      reply.header("retry-after", String(retryAfter));
      throw new AppError(
        429,
        "rate_limited",
        "Too many requests — please slow down and try again shortly.",
      );
    }
  };
}
