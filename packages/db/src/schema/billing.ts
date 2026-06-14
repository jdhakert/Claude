import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_shared";
import { subscriptionStatusEnum } from "./enums";
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
