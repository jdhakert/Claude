import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../src/schema/index";
import { DEMO_USERS, seedDemo } from "../src/seedDemo";
import { makeTestDb, type TestDb } from "./helpers";

let db: TestDb;
let client: { close: () => Promise<void> };
let result: Awaited<ReturnType<typeof seedDemo>>;

beforeEach(async () => {
  const made = await makeTestDb();
  db = made.db;
  client = made.client;
  result = await seedDemo(db as never);
});

afterEach(async () => {
  await client.close();
});

describe("full-length beta demo dataset", () => {
  it("meets the Phase 21 content minimums", async () => {
    const subjects = await db.select().from(schema.subjects);
    const modules = await db.select().from(schema.modules);
    const lessons = await db.select().from(schema.lessons);
    const items = await db.select().from(schema.items);
    const essays = await db.select().from(schema.essayPrompts);
    const pts = await db.select().from(schema.ptTasks);

    expect(subjects.length).toBeGreaterThanOrEqual(3);
    expect(modules.length).toBeGreaterThanOrEqual(5);
    expect(lessons.length).toBeGreaterThanOrEqual(10);
    expect(items.length).toBeGreaterThanOrEqual(50);
    expect(essays.length).toBeGreaterThanOrEqual(3);
    expect(pts.length).toBeGreaterThanOrEqual(1);
  });

  it("defines diagnostic, periodic, and full-length exams with sections", async () => {
    const exams = await db.select().from(schema.exams);
    const kinds = exams.map((e) => e.kind);
    expect(kinds).toContain("diagnostic");
    expect(kinds).toContain("periodic");
    expect(kinds).toContain("full_length");

    const full = exams.find((e) => e.kind === "full_length")!;
    const sections = await db
      .select()
      .from(schema.examSections)
      .where(eq(schema.examSections.examId, full.id));
    // A realistic UBE shape: MBE AM/PM + MEE + MPT.
    expect(sections.length).toBeGreaterThanOrEqual(4);
    expect(sections.map((s) => s.kind)).toContain("mpt_performance_test");
  });

  it("creates the six demo personas with the right roles", async () => {
    const emails = Object.values(DEMO_USERS);
    const users = await db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.email, emails));
    expect(users.length).toBe(emails.length);
    // Every persona has beta access so a tester can log in as any of them.
    expect(users.every((u) => u.betaAccess)).toBe(true);

    const roles = await db.select().from(schema.roles);
    const adminRole = roles.find((r) => r.key === "admin")!;
    const graderRole = roles.find((r) => r.key === "grader")!;
    const admin = users.find((u) => u.email === DEMO_USERS.admin)!;
    const grader = users.find((u) => u.email === DEMO_USERS.grader)!;
    const userRoles = await db.select().from(schema.userRoles);
    expect(
      userRoles.some(
        (ur) => ur.userId === admin.id && ur.roleId === adminRole.id,
      ),
    ).toBe(true);
    expect(
      userRoles.some(
        (ur) => ur.userId === grader.id && ur.roleId === graderRole.id,
      ),
    ).toBe(true);
  });

  it("populates analytics-grade data: attempts, grades, snapshots", async () => {
    const attempts = await db.select().from(schema.questionAttempts);
    const snapshots = await db.select().from(schema.progressSnapshots);
    const essayScores = await db.select().from(schema.essayScores);

    // Plenty of attempts across personas so dashboards are meaningful.
    expect(attempts.length).toBeGreaterThanOrEqual(100);
    // Both correct and incorrect attempts exist (weak vs strong personas).
    expect(attempts.some((a) => a.isCorrect)).toBe(true);
    expect(attempts.some((a) => !a.isCorrect)).toBe(true);
    // Readiness snapshots at multiple grains.
    expect(snapshots.some((s) => s.level === "overall")).toBe(true);
    expect(snapshots.some((s) => s.level === "subject")).toBe(true);
    // Grader-scored essays (not just self-assessment).
    expect(essayScores.some((s) => !s.isSelfAssessment)).toBe(true);
  });

  it("includes NO protected content — everything is original and cleared", async () => {
    // Structural licensing guarantee: every student-facing item is original
    // provenance and license-cleared (Content & Licensing Policy §1).
    const items = await db.select().from(schema.items);
    expect(items.every((i) => i.provenance === "original")).toBe(true);
    expect(items.every((i) => i.licenseStatus === "cleared")).toBe(true);

    const lessons = await db.select().from(schema.lessons);
    expect(lessons.every((l) => l.provenance === "original")).toBe(true);

    const sources = await db.select().from(schema.contentSources);
    expect(sources.every((s) => s.provenance === "original")).toBe(true);
  });

  it("returns a summary the CLI prints for the operator", () => {
    expect(result.counts.subjects).toBeGreaterThanOrEqual(3);
    expect(result.counts.mbeItems).toBeGreaterThanOrEqual(50);
    expect(result.counts.exams).toBe(3);
  });
});
