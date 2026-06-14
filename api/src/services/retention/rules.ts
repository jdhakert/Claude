import { asc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../../db.js";

/** Black-letter rules for a course (rule memorization drills, Phase 14 §3). */
export async function listRules(db: AppDb, courseId: string) {
  return db
    .select({
      id: schema.rules.id,
      statement: schema.rules.statement,
      elements: schema.rules.elements,
      mnemonic: schema.rules.mnemonic,
      issueId: schema.issues.id,
      issueName: schema.issues.name,
    })
    .from(schema.rules)
    .innerJoin(schema.issues, eq(schema.rules.issueId, schema.issues.id))
    .innerJoin(
      schema.subtopics,
      eq(schema.issues.subtopicId, schema.subtopics.id),
    )
    .innerJoin(
      schema.subjects,
      eq(schema.subtopics.subjectId, schema.subjects.id),
    )
    .where(eq(schema.subjects.courseId, courseId))
    .orderBy(asc(schema.issues.name));
}

export async function getRule(db: AppDb, ruleId: string) {
  return (
    await db
      .select()
      .from(schema.rules)
      .where(eq(schema.rules.id, ruleId))
      .limit(1)
  )[0];
}
