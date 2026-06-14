import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors.js";
import { SESSION_COOKIE, validateSession } from "./session.js";

/** preHandler: require a valid session; attaches request.user or throws 401. */
export async function requireAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token)
    throw new AppError(401, "unauthenticated", "Authentication required.");
  const user = await validateSession(request.server.db, token);
  if (!user)
    throw new AppError(401, "unauthenticated", "Invalid or expired session.");
  request.user = user;
}

/** preHandler factory: require one of the given role keys (deny-by-default). */
export function requireRole(...keys: string[]) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    await requireAuth(request, reply);
    const roles = request.user?.roles ?? [];
    if (!roles.some((r) => keys.includes(r))) {
      throw new AppError(403, "forbidden", "Insufficient permissions.");
    }
  };
}
