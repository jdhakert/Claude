import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
}

export const SESSION_COOKIE = "br_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a session row (storing only the hashed token) and return the raw token. */
export async function createSession(
  db: AppDb,
  userId: string,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export async function getUserRoles(
  db: AppDb,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ key: schema.roles.key })
    .from(schema.userRoles)
    .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
    .where(eq(schema.userRoles.userId, userId));
  return rows.map((r) => r.key);
}

/** Resolve a raw token to an authenticated user, or null if invalid/expired. */
export async function validateSession(
  db: AppDb,
  token: string,
): Promise<AuthUser | null> {
  const rows = await db
    .select({ userId: schema.sessions.userId, email: schema.users.email })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(
      and(
        eq(schema.sessions.tokenHash, hashToken(token)),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const roles = await getUserRoles(db, row.userId);
  return { id: row.userId, email: row.email, roles };
}

export async function destroySession(db: AppDb, token: string): Promise<void> {
  await db
    .delete(schema.sessions)
    .where(eq(schema.sessions.tokenHash, hashToken(token)));
}
