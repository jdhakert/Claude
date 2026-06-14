import { eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

export async function getUserByEmail(db: AppDb, email: string) {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return rows[0] ?? null;
}

export async function createUser(
  db: AppDb,
  email: string,
  passwordHash: string,
) {
  const rows = await db
    .insert(schema.users)
    .values({ email, passwordHash })
    .returning();
  const user = rows[0]!;
  await db.insert(schema.profiles).values({ userId: user.id });
  return user;
}

/** Assign a role by key (idempotent). */
export async function assignRoleByKey(db: AppDb, userId: string, key: string) {
  const roleRows = await db
    .select({ id: schema.roles.id })
    .from(schema.roles)
    .where(eq(schema.roles.key, key as never))
    .limit(1);
  const role = roleRows[0];
  if (!role) return;
  await db
    .insert(schema.userRoles)
    .values({ userId, roleId: role.id })
    .onConflictDoNothing();
}

/** Admin view: list users with their roles. */
export async function listUsers(db: AppDb) {
  const users = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      isActive: schema.users.isActive,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users);

  const roleRows = await db
    .select({ userId: schema.userRoles.userId, key: schema.roles.key })
    .from(schema.userRoles)
    .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id));

  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) {
    const list = rolesByUser.get(r.userId) ?? [];
    list.push(r.key);
    rolesByUser.set(r.userId, list);
  }

  return users.map((u) => ({ ...u, roles: rolesByUser.get(u.id) ?? [] }));
}
