import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../../db.js";

export async function hasBetaAccess(
  db: AppDb,
  userId: string,
): Promise<boolean> {
  const u = (
    await db
      .select({ betaAccess: schema.users.betaAccess })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
  )[0];
  return Boolean(u?.betaAccess);
}

function newCode(): string {
  return `BETA-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function createInvite(
  db: AppDb,
  adminId: string,
  input: { email?: string; note?: string },
) {
  const rows = await db
    .insert(schema.betaInvites)
    .values({
      code: newCode(),
      email: input.email ?? null,
      note: input.note ?? null,
      createdBy: adminId,
    })
    .returning();
  return rows[0]!;
}

export async function listInvites(db: AppDb) {
  return db
    .select()
    .from(schema.betaInvites)
    .orderBy(desc(schema.betaInvites.createdAt));
}

export class BetaError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Redeem an invite code → grant the redeemer beta access. */
export async function redeemInvite(db: AppDb, userId: string, code: string) {
  const invite = (
    await db
      .select()
      .from(schema.betaInvites)
      .where(eq(schema.betaInvites.code, code))
      .limit(1)
  )[0];
  if (!invite)
    throw new BetaError("invalid_code", "That invite code is invalid.");
  if (invite.status !== "active")
    throw new BetaError(
      "code_unavailable",
      `That code has already been ${invite.status}.`,
    );

  await db
    .update(schema.betaInvites)
    .set({ status: "redeemed", redeemedBy: userId, redeemedAt: new Date() })
    .where(eq(schema.betaInvites.id, invite.id));
  await db
    .update(schema.users)
    .set({ betaAccess: true, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));

  return { betaAccess: true };
}

/** Admin: grant or revoke a user's beta access. */
export async function setBetaAccess(
  db: AppDb,
  adminId: string,
  targetUserId: string,
  grant: boolean,
) {
  const updated = (
    await db
      .update(schema.users)
      .set({ betaAccess: grant, updatedAt: new Date() })
      .where(eq(schema.users.id, targetUserId))
      .returning()
  )[0];
  if (!updated) return null;
  await db.insert(schema.auditLogs).values({
    actorId: adminId,
    action: "update",
    entityType: "users",
    entityId: targetUserId,
    after: { beta_access: grant },
    reason: grant ? "Granted beta access" : "Revoked beta access",
  });
  return {
    id: updated.id,
    email: updated.email,
    betaAccess: updated.betaAccess,
  };
}

/** Revoke a still-active invite code. */
export async function revokeInvite(db: AppDb, inviteId: string) {
  const updated = (
    await db
      .update(schema.betaInvites)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(
        and(
          eq(schema.betaInvites.id, inviteId),
          eq(schema.betaInvites.status, "active"),
        ),
      )
      .returning()
  )[0];
  return updated ?? null;
}
