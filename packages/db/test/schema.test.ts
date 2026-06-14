import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../src/schema/index";
import { seed } from "../src/seed";
import { makeTestDb, type TestDb } from "./helpers";

let db: TestDb;
let client: { close: () => Promise<void> };
let seeded: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  const made = await makeTestDb();
  db = made.db;
  client = made.client;
  seeded = await seed(db as any);
});

afterEach(async () => {
  await client.close();
});

describe("migrations + seed", () => {
  it("creates a realistic demo student, course, question, essay, and exams", async () => {
    const users = await db.select().from(schema.users);
    expect(users.length).toBe(4);

    const courses = await db.select().from(schema.courses);
    expect(courses).toHaveLength(1);
    expect(courses[0]!.type).toBe("ube");

    const items = await db.select().from(schema.items);
    expect(items.length).toBeGreaterThanOrEqual(1);

    const prompts = await db.select().from(schema.essayPrompts);
    expect(prompts).toHaveLength(1);

    const exams = await db.select().from(schema.exams);
    const kinds = exams.map((e) => e.kind).sort();
    expect(kinds).toContain("diagnostic");
    expect(kinds).toContain("full_length");
  });
});

describe("acceptance: diagnostics + full-length exams", () => {
  it("a full-length exam has sections covering MBE, essay, and PT", async () => {
    const sections = await db
      .select()
      .from(schema.examSections)
      .where(eq(schema.examSections.examId, seeded.examIds.fullLength));
    const kinds = sections.map((s) => s.kind).sort();
    expect(kinds).toEqual(["mbe", "mee_essay", "mpt_performance_test"]);
  });

  it("a diagnostic exam attempt is recorded with pacing data", async () => {
    const attempts = await db
      .select()
      .from(schema.examAttempts)
      .where(eq(schema.examAttempts.examId, seeded.examIds.diagnostic));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.pacing).toMatchObject({ avgSecondsPerItem: 95 });
  });
});

describe("acceptance: progress tracking at every grain", () => {
  it("stores snapshots at overall, subject, subtopic, and issue levels", async () => {
    const snaps = await db
      .select()
      .from(schema.progressSnapshots)
      .where(eq(schema.progressSnapshots.userId, seeded.studentId));
    const levels = snaps.map((s) => s.level).sort();
    expect(levels).toEqual(["issue", "overall", "subject", "subtopic"]);
  });

  it("captures time-management data via question attempt time + exam position", async () => {
    const [qa] = await db
      .select()
      .from(schema.questionAttempts)
      .where(eq(schema.questionAttempts.userId, seeded.studentId));
    expect(qa!.timeMs).toBeGreaterThan(0);
    expect(qa!.positionInExam).toBeTypeOf("number");
  });
});

describe("acceptance: content licensing integrity", () => {
  it("every content item is cleared with a reviewer distinct from the author", async () => {
    const items = await db.select().from(schema.items);
    for (const item of items) {
      expect(item.licenseStatus).toBe("cleared");
      expect(item.provenance).toBe("original");
      expect(item.authorId).toBeTruthy();
      expect(item.reviewerId).toBeTruthy();
      expect(item.reviewerId).not.toBe(item.authorId);
      expect(item.version).toBeGreaterThanOrEqual(1);
    }
  });

  it("records a license-transition audit log entry", async () => {
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, "license_transition"));
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0]!.after).toMatchObject({ license_status: "cleared" });
  });

  it("seed content is original — no protected/scraped provenance present", async () => {
    const sources = await db.select().from(schema.contentSources);
    expect(sources.every((s) => s.provenance === "original")).toBe(true);
  });
});

describe("relationships: referential integrity", () => {
  it("an item has exactly four answer choices, one correct, each with rationale", async () => {
    const choices = await db
      .select()
      .from(schema.answerChoices)
      .where(eq(schema.answerChoices.itemId, seeded.itemId));
    expect(choices).toHaveLength(4);
    expect(choices.filter((c) => c.isCorrect)).toHaveLength(1);
    expect(choices.every((c) => (c.rationale ?? "").length > 0)).toBe(true);
  });

  it("a confidence rating links 1:1 to a question attempt (calibration)", async () => {
    const ratings = await db.select().from(schema.confidenceRatings);
    expect(ratings).toHaveLength(1);
    // Seed models a confident-but-wrong answer (overconfidence signal).
    expect(ratings[0]!.level).toBe("high");
    expect(ratings[0]!.wasCorrect).toBe(false);
  });

  it("the daily assignment has explained blocks each with a reason", async () => {
    const [assignment] = await db
      .select()
      .from(schema.assignments)
      .where(eq(schema.assignments.userId, seeded.studentId));
    const blocks = await db
      .select()
      .from(schema.assignmentItems)
      .where(eq(schema.assignmentItems.assignmentId, assignment!.id));
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(blocks.every((b) => b.reason.length > 0)).toBe(true);
  });

  it("rejects a foreign key violation (enrollment to a non-existent course)", async () => {
    await expect(
      db.insert(schema.enrollments).values({
        userId: seeded.studentId,
        courseId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow();
  });

  it("cascades deletes from item to its answer choices", async () => {
    // Use the seeded item as a license/taxonomy template for a fresh, unattempted
    // item (the seeded one is protected by question_attempts' restrict FK).
    const [tmpl] = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.id, seeded.itemId));
    const [fresh] = await db
      .insert(schema.items)
      .values({
        subtopicId: tmpl!.subtopicId,
        stem: "Throwaway item for cascade test.",
        sourceId: tmpl!.sourceId,
        provenance: tmpl!.provenance,
        licenseStatus: tmpl!.licenseStatus,
        jurisdiction: tmpl!.jurisdiction,
        authorId: tmpl!.authorId,
        reviewerId: tmpl!.reviewerId,
      })
      .returning();
    await db.insert(schema.answerChoices).values([
      { itemId: fresh!.id, label: "A", body: "x", isCorrect: true },
      { itemId: fresh!.id, label: "B", body: "y", isCorrect: false },
    ]);

    await db.delete(schema.items).where(eq(schema.items.id, fresh!.id));
    const choices = await db
      .select()
      .from(schema.answerChoices)
      .where(eq(schema.answerChoices.itemId, fresh!.id));
    expect(choices).toHaveLength(0);
  });

  it("preserves attempt history: deleting an attempted item is restricted", async () => {
    await expect(
      db.delete(schema.items).where(eq(schema.items.id, seeded.itemId)),
    ).rejects.toThrow();
  });

  it("enforces unique enrollment per (user, course)", async () => {
    await expect(
      db.insert(schema.enrollments).values({
        userId: seeded.studentId,
        courseId: seeded.courseId,
      }),
    ).rejects.toThrow();
  });

  it("links an error-journal entry to its issue and attempt (why I missed it)", async () => {
    const [entry] = await db
      .select()
      .from(schema.errorJournalEntries)
      .where(
        and(
          eq(schema.errorJournalEntries.userId, seeded.studentId),
          eq(schema.errorJournalEntries.cause, "wrong_issue_spotted"),
        ),
      );
    expect(entry).toBeTruthy();
    expect(entry!.issueId).toBeTruthy();
    expect(entry!.questionAttemptId).toBeTruthy();
  });
});
