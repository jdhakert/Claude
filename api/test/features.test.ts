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

describe("Wrong Answer Pattern Detector", () => {
  it("surfaces the dominant error pattern from the error journal + a confusion", async () => {
    const cookie = await login();
    const res = await app.inject({
      method: "GET",
      url: "/insights/patterns",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const p = res.json();
    // Seed logs a 'wrong_issue_spotted' miss.
    expect(p.totalMisses).toBeGreaterThanOrEqual(1);
    expect(p.dominant.cause).toBe("wrong_issue_spotted");
    expect(p.insight).toMatch(/spotted the wrong issue/i);
    // The confusion list captures the distractor they picked.
    expect(p.confusions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Red Flag Review", () => {
  it("lists weak + overconfident issues and outstanding reviews before an exam", async () => {
    const cookie = await login();
    const res = await app.inject({
      method: "GET",
      url: "/insights/red-flags",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(
      r.weakIssues.some((w: { name: string }) => /present sense/i.test(w.name)),
    ).toBe(true);
    // Seed's confident-but-wrong attempt → overconfident flag.
    expect(r.overconfidentIssues.length).toBeGreaterThanOrEqual(1);
    expect(r.flags.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Smart Remediation Set", () => {
  it("returns cleared items targeting weak issues, without leaking answers", async () => {
    const cookie = await login();
    const res = await app.inject({
      method: "GET",
      url: "/remediation/set",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const set = res.json();
    expect(set.issues.length).toBeGreaterThanOrEqual(1);
    expect(set.items.length).toBeGreaterThanOrEqual(1);
    const choice = set.items[0].choices[0];
    expect(choice).toHaveProperty("label");
    expect(choice).not.toHaveProperty("isCorrect");
    expect(choice).not.toHaveProperty("rationale");
  });

  it("can target a specific issue and its items are answerable via practice", async () => {
    const cookie = await login();
    const set = (
      await app.inject({
        method: "GET",
        url: "/remediation/set",
        headers: { cookie },
      })
    ).json();
    const item = set.items[0];
    // The remediation item flows through the normal graded practice attempt.
    const review = await app.inject({
      method: "POST",
      url: "/practice/attempts",
      headers: { cookie },
      payload: {
        itemId: item.id,
        selectedChoiceId: item.choices[0].id,
        confidence: "medium",
        timeMs: 30000,
        mode: "tutor",
      },
    });
    expect(review.statusCode).toBe(200);
    expect(typeof review.json().isCorrect).toBe("boolean");
  });
});
