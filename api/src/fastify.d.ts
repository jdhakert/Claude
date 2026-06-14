import "fastify";
import type { AppDb } from "./db.js";
import type { AuthUser } from "./auth/session.js";

declare module "fastify" {
  interface FastifyInstance {
    db: AppDb;
  }
  interface FastifyRequest {
    user: AuthUser | null;
  }
}
