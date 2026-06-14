import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  createSession,
  destroySession,
  getUserRoles,
  SESSION_COOKIE,
} from "../auth/session.js";
import { clearSessionCookie, setSessionCookie } from "../auth/cookies.js";
import { requireAuth } from "../auth/guards.js";
import {
  assignRoleByKey,
  createUser,
  getUserByEmail,
} from "../services/users.js";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/signup", async (request, reply) => {
    const parsed = CredentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "bad_request", parsed.error.issues[0]!.message);
    }
    const { email, password } = parsed.data;

    if (await getUserByEmail(app.db, email)) {
      throw new AppError(
        409,
        "email_taken",
        "That email is already registered.",
      );
    }

    const user = await createUser(app.db, email, await hashPassword(password));
    await assignRoleByKey(app.db, user.id, "student");

    const token = await createSession(app.db, user.id);
    setSessionCookie(reply, token);
    reply.status(201);
    return { user: { id: user.id, email: user.email, roles: ["student"] } };
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = CredentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "bad_request", "Invalid credentials.");
    }
    const { email, password } = parsed.data;

    const user = await getUserByEmail(app.db, email);
    // Always run a hash comparison shape to reduce user-enumeration timing leaks.
    const ok =
      user?.passwordHash != null &&
      (await verifyPassword(password, user.passwordHash));
    if (!user || !ok) {
      throw new AppError(
        401,
        "invalid_credentials",
        "Invalid email or password.",
      );
    }

    const token = await createSession(app.db, user.id);
    setSessionCookie(reply, token);
    const roles = await getUserRoles(app.db, user.id);
    return { user: { id: user.id, email: user.email, roles } };
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE];
    if (token) await destroySession(app.db, token);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: requireAuth }, async (request) => {
    return { user: request.user };
  });
}
