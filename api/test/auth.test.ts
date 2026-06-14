import { makeTestDb } from "@barready/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@barready/db";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";
import { assignRoleByKey } from "../src/services/users.js";

let app: FastifyInstance;
let db: Awaited<ReturnType<typeof makeTestDb>>["db"];

beforeAll(async () => {
  const made = await makeTestDb();
  db = made.db;
  app = await buildApp({ env: loadEnv({ NODE_ENV: "test" }), db: db as never });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

/** Extract the session cookie value from a set-cookie response. */
function sessionCookie(res: {
  cookies: Array<{ name: string; value: string }>;
}) {
  const c = res.cookies.find((x) => x.name === "br_session");
  return c ? `br_session=${c.value}` : "";
}

const VALID = { email: "alice@example.com", password: "supersecret1" };

describe("signup / login / logout", () => {
  it("signs up a new user, defaulting to the student role", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: VALID,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe(VALID.email);
    expect(body.user.roles).toEqual(["student"]);
    expect(sessionCookie(res)).toContain("br_session=");
  });

  it("rejects duplicate signups", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: VALID,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("email_taken");
  });

  it("rejects weak passwords", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: "weak@example.com", password: "short" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    const ok = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: VALID,
    });
    expect(ok.statusCode).toBe(200);
    expect(sessionCookie(ok)).toContain("br_session=");

    const bad = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { ...VALID, password: "wrongpassword" },
    });
    expect(bad.statusCode).toBe(401);
  });

  it("logs out, invalidating the session", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: VALID,
    });
    const cookie = sessionCookie(login);

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(200);

    // The old session no longer authenticates.
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie },
    });
    expect(me.statusCode).toBe(401);
  });
});

describe("protected routes", () => {
  it("blocks /auth/me without a session", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("unauthenticated");
  });

  it("blocks /onboarding without a session", async () => {
    const res = await app.inject({ method: "GET", url: "/onboarding" });
    expect(res.statusCode).toBe(401);
  });

  it("allows /auth/me with a valid session", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: VALID,
    });
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: sessionCookie(login) },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(VALID.email);
  });
});

describe("role-based access (admin)", () => {
  async function loginAs(email: string, password: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    return sessionCookie(res);
  }

  it("blocks students from /admin/users (403)", async () => {
    const cookie = await loginAs(VALID.email, VALID.password);
    const res = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("forbidden");
  });

  it("blocks anonymous access to /admin/users (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/users" });
    expect(res.statusCode).toBe(401);
  });

  it("allows an admin to list users", async () => {
    // Promote a dedicated admin account.
    await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: "boss@example.com", password: "adminpass123" },
    });
    const [admin] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "boss@example.com"));
    await assignRoleByKey(db as never, admin!.id, "admin");

    const cookie = await loginAs("boss@example.com", "adminpass123");
    const res = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const users = res.json().users;
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThanOrEqual(2);
    expect(
      users.find((u: { email: string }) => u.email === "boss@example.com")
        .roles,
    ).toContain("admin");
  });
});

describe("onboarding", () => {
  it("stores onboarding data for the authenticated student", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: VALID,
    });
    const cookie = sessionCookie(login);

    const payload = {
      targetJurisdiction: "ube",
      examDate: "2026-07-28",
      takerStatus: "repeater",
      studyHoursPerWeek: 20,
      selfRatedSubjects: { Evidence: 2, Contracts: 4 },
      diagnosticScheduledFor: "2026-06-20",
      accommodations: { extendedTime: true, timingPreference: "time_and_half" },
      studyStyle: "practice_heavy",
    };

    const post = await app.inject({
      method: "POST",
      url: "/onboarding",
      headers: { cookie },
      payload,
    });
    expect(post.statusCode).toBe(200);
    const profile = post.json().profile;
    expect(profile.weeklyTimeBudgetMinutes).toBe("1200"); // 20h * 60
    expect(profile.priorAttempts).toBe("1"); // repeater
    expect(profile.onboarding.targetJurisdiction).toBe("ube");
    expect(profile.onboarding.accommodations.extendedTime).toBe(true);

    // It persists and is readable back.
    const get = await app.inject({
      method: "GET",
      url: "/onboarding",
      headers: { cookie },
    });
    expect(get.json().profile.onboarding.studyStyle).toBe("practice_heavy");
  });

  it("rejects invalid onboarding payloads", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: VALID,
    });
    const res = await app.inject({
      method: "POST",
      url: "/onboarding",
      headers: { cookie: sessionCookie(login) },
      payload: { targetJurisdiction: "ube", examDate: "not-a-date" },
    });
    expect(res.statusCode).toBe(400);
  });
});
