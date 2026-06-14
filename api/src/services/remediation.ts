import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

/**
 * Smart Remediation Set — assembles a targeted practice set of CLEARED items
 * drawn from the student's weakest issues, so the adaptive plan's remediation
 * blocks (and a dedicated remediation runner) serve real, focused content.
 */
export async function buildRemediationSet(
  db: AppDb,
  userId: string,
  courseId: string,
  opts: { issueId?: string; limit?: number } = {},
) {
  // Determine the target issues: an explicit one, else the weakest by snapshot.
  let targetIssueIds: string[] = [];
  if (opts.issueId) {
    targetIssueIds = [opts.issueId];
  } else {
    const snaps = await db
      .select({
        refId: schema.progressSnapshots.refId,
        mastery: schema.progressSnapshots.mastery,
        capturedAt: schema.progressSnapshots.capturedAt,
      })
      .from(schema.progressSnapshots)
      .where(
        and(
          eq(schema.progressSnapshots.userId, userId),
          eq(schema.progressSnapshots.level, "issue"),
        ),
      )
      .orderBy(desc(schema.progressSnapshots.capturedAt));
    const latest = new Map<string, number | null>();
    for (const s of snaps)
      if (s.refId && !latest.has(s.refId)) latest.set(s.refId, s.mastery);
    targetIssueIds = [...latest.entries()]
      .filter(([, m]) => (m ?? 0) < 0.7)
      .sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0))
      .slice(0, 5)
      .map(([id]) => id);
  }

  // Resolve issue names (for labeling) scoped to the course.
  const issueMeta = targetIssueIds.length
    ? await db
        .select({ id: schema.issues.id, name: schema.issues.name })
        .from(schema.issues)
        .innerJoin(
          schema.subtopics,
          eq(schema.issues.subtopicId, schema.subtopics.id),
        )
        .innerJoin(
          schema.subjects,
          eq(schema.subtopics.subjectId, schema.subjects.id),
        )
        .where(
          and(
            eq(schema.subjects.courseId, courseId),
            inArray(schema.issues.id, targetIssueIds),
          ),
        )
    : [];
  const validIssueIds = issueMeta.map((i) => i.id);
  if (!validIssueIds.length) return { issues: [], items: [] };

  // Cleared items whose PRIMARY issue is a target issue.
  const itemRows = await db
    .select({
      id: schema.items.id,
      stem: schema.items.stem,
      issueId: schema.items.primaryIssueId,
    })
    .from(schema.items)
    .where(
      and(
        eq(schema.items.licenseStatus, "cleared"),
        inArray(schema.items.primaryIssueId, validIssueIds),
      ),
    )
    .orderBy(asc(schema.items.createdAt))
    .limit(opts.limit ?? 10);

  const itemIds = itemRows.map((i) => i.id);
  const choices = itemIds.length
    ? await db
        .select({
          id: schema.answerChoices.id,
          itemId: schema.answerChoices.itemId,
          label: schema.answerChoices.label,
          body: schema.answerChoices.body,
          sortOrder: schema.answerChoices.sortOrder,
        })
        .from(schema.answerChoices)
        .where(inArray(schema.answerChoices.itemId, itemIds))
        .orderBy(asc(schema.answerChoices.sortOrder))
    : [];

  return {
    issues: issueMeta,
    items: itemRows.map((it) => ({
      id: it.id,
      stem: it.stem,
      // No correctness/rationale leak (graded server-side on submit).
      choices: choices
        .filter((c) => c.itemId === it.id)
        .map((c) => ({ id: c.id, label: c.label, body: c.body })),
    })),
  };
}
