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
async function login() {
  return cookieOf(
    await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: DEMO_STUDENT_EMAIL, password: DEMO_STUDENT_PASSWORD },
    }),
  );
}

describe("adaptive plan generation (DB-backed)", () => {
  it("generates a realistic, stored, trackable daily plan from real signals", async () => {
    const cookie = await login();
    const res = await app.inject({
      method: "POST",
      url: "/plan/generate",
      headers: { cookie },
      payload: { minutesOverride: 120 },
    });
    expect(res.statusCode).toBe(200);
    const plan = res.json();
    expect(plan.blocks.length).toBeGreaterThanOrEqual(2);
    // Every block explains itself.
    expect(plan.blocks.every((b: { reason: string }) => b.reason)).toBe(true);
    // The seed gives the demo student a due flashcard → a must-do review block.
    expect(
      plan.blocks.some((b: { kind: string }) => b.kind === "flashcard_review"),
    ).toBe(true);

    // It is persisted and fetchable.
    const stored = await app.inject({
      method: "GET",
      url: "/plan/today",
      headers: { cookie },
    });
    expect(stored.json().blocks.length).toBe(plan.blocks.length);

    // Generating again replaces (not duplicates) the day's plan.
    await app.inject({
      method: "POST",
      url: "/plan/generate",
      headers: { cookie },
      payload: { minutesOverride: 120 },
    });
    const assignments = await db
      .select()
      .from(schema.assignments)
      .where(eq(schema.assignments.userId, seeded.studentId));
    const today = new Date().toISOString().slice(0, 10);
    expect(assignments.filter((a) => a.forDate === today)).toHaveLength(1);
  });

  it("weaknesses affect assignments: a weak issue yields a remediation block", async () => {
    const cookie = await login();
    // The seed records a confident-but-wrong attempt on 'present sense
    // impression' plus a low issue-mastery snapshot → should surface remediation.
    const plan = (
      await app.inject({
        method: "POST",
        url: "/plan/generate",
        headers: { cookie },
        payload: { minutesOverride: 180 },
      })
    ).json();
    const remediation = plan.blocks.find(
      (b: { kind: string }) => b.kind === "remediation",
    );
    expect(remediation).toBeDefined();
    expect(remediation.reason).toMatch(/present sense impression/i);
  });

  it("respects a short time budget but keeps must-do reviews", async () => {
    const cookie = await login();
    const plan = (
      await app.inject({
        method: "POST",
        url: "/plan/generate",
        headers: { cookie },
        payload: { minutesOverride: 10 },
      })
    ).json();
    expect(plan.estMinutes).toBeGreaterThan(0);
    expect(
      plan.blocks.some((b: { kind: string }) => b.kind === "flashcard_review"),
    ).toBe(true);
  });

  it("blocks can be marked complete (trackable)", async () => {
    const cookie = await login();
    const plan = (
      await app.inject({
        method: "POST",
        url: "/plan/generate",
        headers: { cookie },
        payload: { minutesOverride: 120 },
      })
    ).json();
    const today = (
      await app.inject({
        method: "GET",
        url: "/plan/today",
        headers: { cookie },
      })
    ).json();
    const block = today.blocks[0];
    const done = await app.inject({
      method: "POST",
      url: `/plan/items/${block.id}/complete`,
      headers: { cookie },
    });
    expect(done.statusCode).toBe(200);
    void plan;
  });
});
