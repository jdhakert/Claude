import { makeTestDb } from "@barready/db/testing";
import {
  DEMO_STUDENT_EMAIL,
  DEMO_STUDENT_PASSWORD,
  seed,
} from "@barready/db/seed";
import { schema } from "@barready/db";
import { and, eq } from "drizzle-orm";
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

describe("spaced repetition", () => {
  it("lists due cards and reviewing reschedules + logs + updates progress", async () => {
    const cookie = await login();
    const due = await app.inject({
      method: "GET",
      url: "/srs/due",
      headers: { cookie },
    });
    expect(due.statusCode).toBe(200);
    // Seed gives the demo student a due flashcard tied to an issue.
    expect(due.json().cards.length).toBeGreaterThanOrEqual(1);
    const card = due.json().cards[0];
    expect(card.front).toBeTruthy();

    const reviewed = await app.inject({
      method: "POST",
      url: `/srs/${card.reviewId}/review`,
      headers: { cookie },
      payload: { rating: "good" },
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().intervalDays).toBeGreaterThanOrEqual(1);

    // Review history + accuracy recorded.
    const stats = await app.inject({
      method: "GET",
      url: "/srs/stats",
      headers: { cookie },
    });
    expect(stats.json().totalReviews).toBeGreaterThanOrEqual(1);
    expect(stats.json().accuracy).toBeGreaterThan(0);

    // It is no longer due (rescheduled into the future).
    const dueAfter = await app.inject({
      method: "GET",
      url: "/srs/due",
      headers: { cookie },
    });
    expect(
      dueAfter
        .json()
        .cards.some((c: { reviewId: string }) => c.reviewId === card.reviewId),
    ).toBe(false);
  });

  it("turns a manual/missed-question note into a scheduled card", async () => {
    const cookie = await login();
    const created = await app.inject({
      method: "POST",
      url: "/srs/cards",
      headers: { cookie },
      payload: {
        front: "Elements of a present sense impression?",
        back: "Describes event; contemporaneous.",
      },
    });
    expect(created.statusCode).toBe(200);
    // The new card is immediately due.
    const due = await app.inject({
      method: "GET",
      url: "/srs/due",
      headers: { cookie },
    });
    expect(due.json().cards.length).toBeGreaterThanOrEqual(1);
  });
});

describe("rule memorization drills", () => {
  it("lists rules and records a drill that schedules the rule card", async () => {
    const cookie = await login();
    const rules = await app.inject({
      method: "GET",
      url: `/rules?courseId=${seeded.courseId}`,
      headers: { cookie },
    });
    expect(rules.statusCode).toBe(200);
    const rule = rules.json().rules[0];
    expect(rule.elements.length).toBeGreaterThanOrEqual(1); // elements checklist

    const drill = await app.inject({
      method: "POST",
      url: `/rules/${rule.id}/drill`,
      headers: { cookie },
      payload: { rating: "good" },
    });
    expect(drill.statusCode).toBe(200);
    // A rule-card SRS review now exists.
    const rev = await db
      .select()
      .from(schema.srsReviews)
      .where(
        and(
          eq(schema.srsReviews.userId, seeded.studentId),
          eq(schema.srsReviews.ruleId, rule.id),
        ),
      );
    expect(rev.length).toBe(1);
  });
});

describe("attack outline builder", () => {
  it("creates an editable outline with issue-tied entries", async () => {
    const cookie = await login();
    const [subject] = await db.select().from(schema.subjects).limit(1);
    const [issue] = await db.select().from(schema.issues).limit(1);

    const outline = (
      await app.inject({
        method: "POST",
        url: "/outlines",
        headers: { cookie },
        payload: { title: "Evidence Attack Outline", subjectId: subject!.id },
      })
    ).json().outline;
    expect(outline.id).toBeTruthy();

    const entry = (
      await app.inject({
        method: "POST",
        url: `/outlines/${outline.id}/entries`,
        headers: { cookie },
        payload: {
          issueId: issue!.id,
          rule: "Present sense impression admits a contemporaneous description.",
          triggerFacts: "A bystander narrates an event as it happens.",
          commonTraps: "Confusing PSI with excited utterance.",
          checklist: ["Statement?", "Contemporaneous?", "Describes event?"],
        },
      })
    ).json().entry;
    expect(entry.issueId).toBe(issue!.id);

    // Editable.
    const edited = await app.inject({
      method: "PATCH",
      url: `/outline-entries/${entry.id}`,
      headers: { cookie },
      payload: { commonTraps: "Also watch the unavailability requirement." },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().entry.commonTraps).toMatch(/unavailability/);

    // Fetch with entries.
    const fetched = await app.inject({
      method: "GET",
      url: `/outlines/${outline.id}`,
      headers: { cookie },
    });
    expect(fetched.json().entries).toHaveLength(1);
    expect(fetched.json().entries[0].checklist.length).toBe(3);
  });

  it("prevents accessing another user's outline", async () => {
    const cookie = await login();
    const mine = (
      await app.inject({
        method: "POST",
        url: "/outlines",
        headers: { cookie },
        payload: { title: "Private outline" },
      })
    ).json().outline;

    // A different user cannot read it.
    await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: "other@example.com", password: "password1234" },
    });
    const otherCookie = cookieOf(
      await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "other@example.com", password: "password1234" },
      }),
    );
    const res = await app.inject({
      method: "GET",
      url: `/outlines/${mine.id}`,
      headers: { cookie: otherCookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
