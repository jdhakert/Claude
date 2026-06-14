import { makeTestDb } from "@barready/db/testing";
import {
  DEMO_STUDENT_EMAIL,
  DEMO_STUDENT_PASSWORD,
  seed,
} from "@barready/db/seed";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";

let app: FastifyInstance;

beforeAll(async () => {
  const { db } = await makeTestDb();
  await seed(db as never);
  app = await buildApp({ env: loadEnv({ NODE_ENV: "test" }), db: db as never });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function sessionCookie(res: {
  cookies: Array<{ name: string; value: string }>;
}) {
  const c = res.cookies.find((x) => x.name === "br_session");
  return c ? `br_session=${c.value}` : "";
}

async function loginAsDemo() {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: DEMO_STUDENT_EMAIL, password: DEMO_STUDENT_PASSWORD },
  });
  expect(res.statusCode).toBe(200);
  return sessionCookie(res);
}

describe("GET /dashboard (seed-backed)", () => {
  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/dashboard" });
    expect(res.statusCode).toBe(401);
  });

  it("returns the demo student's real, database-backed dashboard", async () => {
    const cookie = await loginAsDemo();
    const res = await app.inject({
      method: "GET",
      url: "/dashboard",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json();

    // Current course
    expect(d.course?.type).toBe("ube");

    // Exam countdown derived from the profile's target exam date
    expect(typeof d.examCountdown.daysRemaining).toBe("number");

    // Diagnostic completed (seed records a submitted diagnostic attempt)
    expect(d.diagnostic.status).toBe("completed");
    expect(d.diagnostic.scorePct).toBeGreaterThan(0);

    // Today's assignment with explained blocks
    expect(d.todaysAssignment.items.length).toBeGreaterThanOrEqual(3);
    expect(
      d.todaysAssignment.items.every((i: { reason: string }) => i.reason),
    ).toBe(true);

    // Progress by subject + weak areas (lowest mastery first)
    expect(d.progressBySubject.length).toBeGreaterThanOrEqual(1);
    expect(d.weakAreas[0].name).toMatch(/present sense impression/i);

    // Recent activity + next recommended task
    expect(d.recentActivity.length).toBeGreaterThanOrEqual(1);
    expect(d.nextTask).not.toBeNull();

    // Readiness present but not inflated
    expect(d.readiness).toBeGreaterThan(0);
    expect(d.readiness).toBeLessThanOrEqual(1);
  });

  it("returns graceful empty data for a brand-new user", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: "fresh@example.com", password: "freshpass123" },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "fresh@example.com", password: "freshpass123" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/dashboard",
      headers: { cookie: sessionCookie(login) },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json();
    expect(d.course).toBeNull();
    expect(d.todaysAssignment).toBeNull();
    expect(d.progressBySubject).toEqual([]);
    expect(d.weakAreas).toEqual([]);
    expect(d.diagnostic.status).toBe("not_started");
  });
});
