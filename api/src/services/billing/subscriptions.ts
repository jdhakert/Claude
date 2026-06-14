import { desc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../../db.js";
import { planById } from "./plans.js";

export async function getSubscription(db: AppDb, userId: string) {
  const row = (
    await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1)
  )[0];
  if (!row) return null;
  return {
    status: row.status,
    plan: row.plan,
    entitlements: row.entitlements,
    currentPeriodEnd: row.currentPeriodEnd
      ? row.currentPeriodEnd.toISOString()
      : null,
  };
}

/**
 * Activate (or update) a subscription. Used by the stub "checkout complete"
 * flow; a real payment webhook would call the same logic.
 */
export async function activateSubscription(
  db: AppDb,
  userId: string,
  planId: string,
) {
  const plan = planById(planId);
  if (!plan) return null;
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const existing = (
    await db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1)
  )[0];

  if (existing) {
    await db
      .update(schema.subscriptions)
      .set({
        status: "active",
        plan: plan.id,
        entitlements: plan.entitlements,
        currentPeriodEnd: periodEnd,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, existing.id));
  } else {
    await db.insert(schema.subscriptions).values({
      userId,
      status: "active",
      plan: plan.id,
      entitlements: plan.entitlements,
      currentPeriodEnd: periodEnd,
    });
  }
  return getSubscription(db, userId);
}
