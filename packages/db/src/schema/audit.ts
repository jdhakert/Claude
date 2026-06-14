import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_shared";
import { auditActionEnum } from "./enums";
import { users } from "./identity";

/**
 * Immutable audit trail. Required for license-status transitions and
 * role changes (Content & Licensing Policy §5, Charter §3).
 */
export const auditLogs = pgTable("audit_logs", {
  id: pk(),
  actorId: uuid("actor_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: auditActionEnum("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  before: jsonb("before").$type<Record<string, unknown>>(),
  after: jsonb("after").$type<Record<string, unknown>>(),
  reason: text("reason"),
  ...timestamps,
});
