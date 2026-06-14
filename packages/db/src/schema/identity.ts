import {
  boolean,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_shared";
import { roleKeyEnum } from "./enums";

/** Authenticatable account. PII kept minimal (Charter §3). */
export const users = pgTable(
  "users",
  {
    id: pk(),
    email: text("email").notNull(),
    // Null when the account is OAuth-only (no local password).
    passwordHash: text("password_hash"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

/** 1:1 profile / persona signals / onboarding inputs (Learning System §1). */
export const profiles = pgTable("profiles", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  // Target exam date the whole plan is built around.
  targetExamDate: timestamp("target_exam_date", { withTimezone: true }),
  weeklyTimeBudgetMinutes: text("weekly_time_budget_minutes"),
  priorAttempts: text("prior_attempts"),
  // Self-reported strengths/weaknesses + persona flags captured at onboarding.
  onboarding: jsonb("onboarding").$type<Record<string, unknown>>(),
  // Future school/cohort association (nullable now — Architecture §3.1).
  organizationId: uuid("organization_id"),
  cohortId: uuid("cohort_id"),
  ...timestamps,
});

/** Catalog of roles (Architecture §3). Seeded with the known role keys. */
export const roles = pgTable(
  "roles",
  {
    id: pk(),
    key: roleKeyEnum("key").notNull(),
    description: text("description").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("roles_key_unique").on(t.key)],
);

/** User ↔ role assignment (RBAC, additive). */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

/** Server-side session (httpOnly rotating tokens — Charter §3). */
export const sessions = pgTable(
  "sessions",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("sessions_token_unique").on(t.tokenHash)],
);
