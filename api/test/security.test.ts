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

describe("security headers", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const { db } = await makeTestDb();
    await seed(db as never);
    app = await buildApp({
      env: loadEnv({ NODE_ENV: "test" }),
      db: db as never,
    });
    await app.ready();
  });
  afterAll(async () => app.close());

  it("sets hardening headers (helmet) on responses", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers).toHaveProperty("x-frame-options");
  });
});

describe("auth rate limiting", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const { db } = await makeTestDb();
    await seed(db as never);
    // Enable a tight limiter for this app instance.
    app = await buildApp({
      env: loadEnv({ NODE_ENV: "test" }),
      db: db as never,
      authRateLimitMax: 5,
    });
    await app.ready();
  });
  afterAll(async () => app.close());

  it("returns 429 after too many login attempts", async () => {
    let limited = false;
    for (let i = 0; i < 8; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "nobody@example.com", password: "wrongpassword" },
      });
      if (res.statusCode === 429) {
        limited = true;
        expect(res.json().error.code).toBe("rate_limited");
        expect(res.headers).toHaveProperty("retry-after");
        break;
      }
    }
    expect(limited).toBe(true);
  });
});

describe("privacy: data export + deletion", () => {
  let app: FastifyInstance;
  let db: Awaited<ReturnType<typeof makeTestDb>>["db"];
  beforeAll(async () => {
    const made = await makeTestDb();
    db = made.db;
    await seed(db as never);
    app = await buildApp({
      env: loadEnv({ NODE_ENV: "test" }),
      db: db as never,
    });
    await app.ready();
  });
  afterAll(async () => app.close());

  function cookieOf(r: { cookies: Array<{ name: string; value: string }> }) {
    const c = r.cookies.find((x) => x.name === "br_session");
    return c ? `br_session=${c.value}` : "";
  }
  async function login(email: string) {
    return cookieOf(
      await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: DEMO_STUDENT_PASSWORD },
      }),
    );
  }

  it("exports the student's own performance data", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL);
    const res = await app.inject({
      method: "GET",
      url: "/account/export",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.account.user.email).toBe(DEMO_STUDENT_EMAIL);
    expect(data.performance).toHaveProperty("questionAttempts");
    expect(data.performance).toHaveProperty("essaySubmissions");
  });

  it("requires explicit confirmation and then deletes the account + data", async () => {
    // Create a disposable user.
    await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: "deleteme@example.com", password: "password1234" },
    });
    const cookie = cookieOf(
      await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "deleteme@example.com", password: "password1234" },
      }),
    );

    // Without confirmation → rejected.
    const noConfirm = await app.inject({
      method: "DELETE",
      url: "/account",
      headers: { cookie },
      payload: {},
    });
    expect(noConfirm.statusCode).toBe(400);

    const del = await app.inject({
      method: "DELETE",
      url: "/account",
      headers: { cookie },
      payload: { confirm: true },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().deleted).toBe(true);

    // The user row is gone.
    const [gone] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "deleteme@example.com"));
    expect(gone).toBeUndefined();
  });
});
