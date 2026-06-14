import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_shared";
import { betaInviteStatusEnum, subscriptionStatusEnum } from "./enums";
import { users } from "./identity";

/** Stripe-backed subscription → course entitlements (ADR 0001, Architecture §4). */
export const subscriptions = pgTable("subscriptions", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: subscriptionStatusEnum("status").notNull().default("trialing"),
  plan: text("plan").notNull(),
  // External payment-provider identifiers (Stripe). Nullable for demo/seed.
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  // Which courses this subscription grants access to.
  entitlements: jsonb("entitlements").$type<string[]>().notNull().default([]),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  ...timestamps,
});

/**
 * Invite-only beta access codes. An admin issues codes; redeeming one grants the
 * redeemer `beta_access`. Codes can be revoked.
 */
export const betaInvites = pgTable(
  "beta_invites",
  {
    id: pk(),
    code: text("code").notNull(),
    // Optional target email (informational; any signed-in user may redeem).
    email: text("email"),
    note: text("note"),
    status: betaInviteStatusEnum("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    redeemedBy: uuid("redeemed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("beta_invites_code_unique").on(t.code)],
);
