import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

const BASE_ROLES = [
  { key: "student", description: "Studies for the bar exam" },
  { key: "instructor", description: "Mentors assigned students" },
  { key: "grader", description: "Grades essays and PTs" },
  { key: "content_author", description: "Authors content drafts" },
  { key: "content_reviewer", description: "Reviews and clears content" },
  { key: "admin", description: "Administers the platform" },
] as const;

/** Idempotently ensure the base role rows exist (safe to call at startup). */
export async function ensureBaseRoles(db: AppDb): Promise<void> {
  await db
    .insert(schema.roles)
    .values([...BASE_ROLES])
    .onConflictDoNothing({ target: schema.roles.key });
}
