import { and, desc, eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

const CAUSE_LABEL: Record<string, string> = {
  didnt_know_rule: "didn't know the rule",
  misread_facts: "misread the facts",
  wrong_issue_spotted: "spotted the wrong issue",
  rule_misapplied: "knew the rule but misapplied it",
  timing_rushed: "rushed / ran out of time",
  careless: "careless slip",
  trap_distractor: "fell for a trap distractor",
};

/**
 * Wrong Answer Pattern Detector — finds the student's dominant error pattern
 * from the error journal, plus the distractors they gravitate toward, so review
 * targets *how* they fail, not just *what*.
 */
export async function wrongAnswerPatterns(db: AppDb, userId: string) {
  const journal = await db
    .select({ cause: schema.errorJournalEntries.cause })
    .from(schema.errorJournalEntries)
    .where(eq(schema.errorJournalEntries.userId, userId));

  const counts = new Map<string, number>();
  for (const j of journal) counts.set(j.cause, (counts.get(j.cause) ?? 0) + 1);
  const total = journal.length;
  const causeBreakdown = [...counts.entries()]
    .map(([cause, count]) => ({
      cause,
      label: CAUSE_LABEL[cause] ?? cause,
      count,
      pct: total ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count);
  const dominant = causeBreakdown[0] ?? null;

  // Distractor gravity: among missed MBE items, which wrong choice was picked,
  // grouped by tested issue.
  const misses = await db
    .select({
      issueName: schema.issues.name,
      chosenBody: schema.answerChoices.body,
    })
    .from(schema.questionAttempts)
    .innerJoin(
      schema.items,
      eq(schema.questionAttempts.itemId, schema.items.id),
    )
    .innerJoin(schema.issues, eq(schema.items.primaryIssueId, schema.issues.id))
    .leftJoin(
      schema.answerChoices,
      eq(schema.questionAttempts.selectedChoiceId, schema.answerChoices.id),
    )
    .where(
      and(
        eq(schema.questionAttempts.userId, userId),
        eq(schema.questionAttempts.isCorrect, false),
      ),
    );

  const byIssue = new Map<string, Map<string, number>>();
  for (const m of misses) {
    if (!m.chosenBody) continue;
    const picks = byIssue.get(m.issueName) ?? new Map();
    picks.set(m.chosenBody, (picks.get(m.chosenBody) ?? 0) + 1);
    byIssue.set(m.issueName, picks);
  }
  const confusions = [...byIssue.entries()].map(([issueName, picks]) => ({
    issueName,
    topPick: [...picks.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    pickCount: [...picks.values()].reduce((a, b) => a + b, 0),
  }));

  const insight = dominant
    ? `${Math.round(dominant.pct * 100)}% of your logged misses are because you ${dominant.label}. Target that pattern, not just the topics.`
    : "Log why you miss questions to surface your error patterns.";

  return { totalMisses: total, dominant, causeBreakdown, confusions, insight };
}

/**
 * Red Flag Review — a pre-exam briefing surfacing the student's highest-risk
 * items (weak issues, overconfident issues, overdue reviews) so they don't walk
 * into a full-length cold.
 */
export async function redFlagReview(
  db: AppDb,
  userId: string,
  courseId: string,
) {
  // Weakest issues (latest issue snapshots).
  const issueRows = await db
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
  for (const r of issueRows)
    if (r.refId && !latest.has(r.refId)) latest.set(r.refId, r.mastery);

  const issueNames = new Map<string, string>();
  if (latest.size) {
    const names = await db
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
      .where(eq(schema.subjects.courseId, courseId));
    for (const n of names) issueNames.set(n.id, n.name);
  }
  const weakIssues = [...latest.entries()]
    .filter(([id, m]) => issueNames.has(id) && (m ?? 0) < 0.6)
    .sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0))
    .slice(0, 5)
    .map(([id, m]) => ({ id, name: issueNames.get(id)!, mastery: m }));

  // Overconfident issues (confident but wrong).
  const overconf = await db
    .select({ name: schema.issues.name })
    .from(schema.confidenceRatings)
    .innerJoin(
      schema.questionAttempts,
      eq(
        schema.confidenceRatings.questionAttemptId,
        schema.questionAttempts.id,
      ),
    )
    .innerJoin(
      schema.items,
      eq(schema.questionAttempts.itemId, schema.items.id),
    )
    .innerJoin(schema.issues, eq(schema.items.primaryIssueId, schema.issues.id))
    .where(
      and(
        eq(schema.questionAttempts.userId, userId),
        eq(schema.confidenceRatings.level, "high"),
        eq(schema.confidenceRatings.wasCorrect, false),
      ),
    );
  const overconfidentIssues = [...new Set(overconf.map((o) => o.name))];

  // Overdue reviews.
  const due = await db
    .select({ id: schema.srsReviews.id })
    .from(schema.srsReviews)
    .where(eq(schema.srsReviews.userId, userId));
  const dueCount = due.length;

  const flags: string[] = [];
  for (const w of weakIssues)
    flags.push(`Weak: ${w.name} (${Math.round((w.mastery ?? 0) * 100)}%)`);
  for (const o of overconfidentIssues)
    flags.push(`Overconfident: ${o} — you feel sure but miss it`);
  if (dueCount > 0) flags.push(`${dueCount} review(s) outstanding`);

  return { weakIssues, overconfidentIssues, dueCount, flags };
}
