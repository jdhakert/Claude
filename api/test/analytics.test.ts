import { makeTestDb } from "@barready/db/testing";
import {
  DEMO_STUDENT_EMAIL,
  DEMO_STUDENT_PASSWORD,
  seed,
} from "@barready/db/seed";
import { schema } from "@barready/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";
import { assignRoleByKey } from "../src/services/users.js";

let app: FastifyInstance;
let db: Awaited<ReturnType<typeof makeTestDb>>["db"];
let seeded: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  const made = await makeTestDb();
  db = made.db;
  seeded = await seed(db as never);
  app = await buildApp({ env: loadEnv({ NODE_ENV: "test" }), db: db as never });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

function cookieOf(r: { cookies: Array<{ name: string; value: string }> }) {
  const c = r.cookies.find((x) => x.name === "br_session");
  return c ? `br_session=${c.value}` : "";
}
async function login(email: string, password: string) {
  return cookieOf(
    await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    }),
  );
}
async function signupAndPromote(email: string, role: string) {
  await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { email, password: "password1234" },
  });
  const [u] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email));
  await assignRoleByKey(db as never, u!.id, role);
  return login(email, "password1234");
}

describe("student analytics (database-backed)", () => {
  it("returns readiness, performance grains, trends, calibration, and next focus", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const res = await app.inject({
      method: "GET",
      url: "/analytics/me",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const a = res.json();
    expect(a.readiness).toBeGreaterThan(0);
    expect(a.subjects.length).toBeGreaterThanOrEqual(1);
    expect(a.issues.length).toBeGreaterThanOrEqual(1);
    // What to do next is surfaced (weakest issue).
    expect(a.nextFocus).toMatch(/present sense impression/i);

    // Confidence calibration buckets present; seed has a confident-but-wrong
    // attempt → 'high' bucket flagged overconfident.
    const high = a.calibration.find(
      (c: { level: string }) => c.level === "high",
    );
    expect(high.count).toBeGreaterThanOrEqual(1);
    expect(high.flag).toBe("overconfident");

    // Trends exist (arrays).
    expect(Array.isArray(a.mbeAccuracyTrend)).toBe(true);
    expect(Array.isArray(a.essayTrend)).toBe(true);
    expect(Array.isArray(a.ptTrend)).toBe(true);
    expect(Array.isArray(a.completionTrend)).toBe(true);
  });
});

describe("instructor/admin analytics", () => {
  it("blocks students from admin analytics", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const res = await app.inject({
      method: "GET",
      url: "/admin/analytics/students",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets an instructor see students, cohort, at-risk, and content performance", async () => {
    const cookie = await signupAndPromote("prof@example.com", "instructor");

    const list = await app.inject({
      method: "GET",
      url: "/admin/analytics/students",
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().students.length).toBeGreaterThanOrEqual(1);

    const cohort = await app.inject({
      method: "GET",
      url: "/admin/analytics/cohort",
      headers: { cookie },
    });
    expect(cohort.json().totalStudents).toBeGreaterThanOrEqual(1);
    expect(cohort.json()).toHaveProperty("distribution");

    const content = await app.inject({
      method: "GET",
      url: `/admin/analytics/content?courseId=${seeded.courseId}`,
      headers: { cookie },
    });
    expect(content.statusCode).toBe(200);
    // Seed has a missed question on present sense impression.
    expect(content.json().commonlyMissedIssues.length).toBeGreaterThanOrEqual(
      1,
    );
    expect(content.json().questionDifficulty.length).toBeGreaterThanOrEqual(1);

    const atRisk = await app.inject({
      method: "GET",
      url: "/admin/analytics/at-risk",
      headers: { cookie },
    });
    expect(atRisk.statusCode).toBe(200);
    expect(Array.isArray(atRisk.json().students)).toBe(true);
  });
});
