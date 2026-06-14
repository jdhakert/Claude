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

function cookieOf(res: { cookies: Array<{ name: string; value: string }> }) {
  const c = res.cookies.find((x) => x.name === "br_session");
  return c ? `br_session=${c.value}` : "";
}
async function login(email: string, password: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  return cookieOf(res);
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

describe("practice taxonomy + item delivery", () => {
  it("returns subjects/subtopics for selection", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const res = await app.inject({
      method: "GET",
      url: `/practice/taxonomy?courseId=${seeded.courseId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const subjects = res.json().subjects;
    expect(subjects.some((s: { name: string }) => s.name === "Evidence")).toBe(
      true,
    );
  });

  it("serves cleared items WITHOUT leaking the correct answer", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const res = await app.inject({
      method: "GET",
      url: `/practice/items?courseId=${seeded.courseId}&limit=5`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    const choice = items[0].choices[0];
    expect(choice).toHaveProperty("label");
    expect(choice).not.toHaveProperty("isCorrect");
    expect(choice).not.toHaveProperty("rationale");
  });
});

describe("attempt submission stores everything + returns review", () => {
  it("records correctness, time, confidence and returns rationale/rule/explanation", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const items = (
      await app.inject({
        method: "GET",
        url: `/practice/items?courseId=${seeded.courseId}`,
        headers: { cookie },
      })
    ).json().items;
    const item = items[0];

    const res = await app.inject({
      method: "POST",
      url: "/practice/attempts",
      headers: { cookie },
      payload: {
        itemId: item.id,
        selectedChoiceId: item.choices[0].id,
        confidence: "medium",
        timeMs: 42000,
        mode: "tutor",
      },
    });
    expect(res.statusCode).toBe(200);
    const review = res.json();
    expect(typeof review.isCorrect).toBe("boolean");
    expect(review.correctChoiceId).toBeTruthy();
    // Review surfaces per-choice rationale, the rule takeaway, and explanation.
    expect(
      review.choices.every((c: { rationale: string }) => c.rationale),
    ).toBe(true);
    expect(review.ruleTakeaway).toMatch(/present sense impression/i);
    expect(review.explanation).toBeTruthy();
    expect(review.issue.name).toMatch(/present sense impression/i);

    // The attempt is stored with confidence (progress analytics can use it).
    const attempts = await db
      .select()
      .from(schema.questionAttempts)
      .where(eq(schema.questionAttempts.itemId, item.id));
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    const ratings = await db
      .select()
      .from(schema.confidenceRatings)
      .where(eq(schema.confidenceRatings.questionAttemptId, review.attemptId));
    expect(ratings).toHaveLength(1);
    expect(ratings[0]!.level).toBe("medium");
  });

  it("adds an error-journal entry and converts to a flashcard", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const items = (
      await app.inject({
        method: "GET",
        url: `/practice/items?courseId=${seeded.courseId}`,
        headers: { cookie },
      })
    ).json().items;
    const review = (
      await app.inject({
        method: "POST",
        url: "/practice/attempts",
        headers: { cookie },
        payload: {
          itemId: items[0].id,
          selectedChoiceId: items[0].choices[1].id,
          confidence: "high",
          timeMs: 30000,
          mode: "tutor",
        },
      })
    ).json();

    const journal = await app.inject({
      method: "POST",
      url: "/error-journal",
      headers: { cookie },
      payload: {
        questionAttemptId: review.attemptId,
        cause: "wrong_issue_spotted",
        note: "Missed it was offered for truth.",
      },
    });
    expect(journal.statusCode).toBe(200);
    expect(journal.json().entry.cause).toBe("wrong_issue_spotted");

    const card = await app.inject({
      method: "POST",
      url: "/flashcards",
      headers: { cookie },
      payload: {
        front: "PSI elements?",
        back: "Describes event; contemporaneous.",
      },
    });
    expect(card.statusCode).toBe(200);
    // User flashcards are user_supplied and cleared for personal use.
    expect(card.json().flashcard.provenance).toBe("user_supplied");
  });
});

describe("admin import workflow + mandatory license metadata", () => {
  it("rejects an item import that is missing license metadata", async () => {
    const cookie = await signupAndPromote(
      "qauthor@example.com",
      "content_author",
    );
    const res = await app.inject({
      method: "POST",
      url: "/admin/items",
      headers: { cookie },
      payload: {
        subtopicId: seeded.courseId, // wrong but irrelevant; metadata missing
        stem: "A question with no source or jurisdiction metadata at all.",
        choices: [
          { label: "A", body: "x", isCorrect: true },
          { label: "B", body: "y", isCorrect: false },
        ],
        // no `source`, no `jurisdiction`
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("missing_license_metadata");
  });

  it("imports an original item (in_review), and a reviewer clears it for students", async () => {
    const authorCookie = await signupAndPromote(
      "qauthor2@example.com",
      "content_author",
    );
    // Find a real subtopic to attach to.
    const [subtopic] = await db.select().from(schema.subtopics).limit(1);

    const created = await app.inject({
      method: "POST",
      url: "/admin/items",
      headers: { cookie: authorCookie },
      payload: {
        subtopicId: subtopic!.id,
        stem: "An original, fictional MBE-style question for testing imports.",
        source: { name: "BarReady Original", provenance: "original" },
        jurisdiction: "ube",
        choices: [
          { label: "A", body: "Right", isCorrect: true, rationale: "Because." },
          {
            label: "B",
            body: "Wrong",
            isCorrect: false,
            rationale: "Not this.",
          },
        ],
        explanation: "Original explanation.",
      },
    });
    expect(created.statusCode).toBe(200);
    const itemId = created.json().item.id;
    expect(created.json().item.licenseStatus).toBe("in_review");

    // Reviewer clears it.
    const reviewerCookie = await signupAndPromote(
      "qreviewer@example.com",
      "content_reviewer",
    );
    const cleared = await app.inject({
      method: "POST",
      url: `/admin/items/${itemId}/clear`,
      headers: { cookie: reviewerCookie },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().item.licenseStatus).toBe("cleared");

    // An audit-log entry records the transition.
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, itemId));
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
