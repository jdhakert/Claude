import { makeTestDb } from "@barready/db/testing";
import {
  DEMO_STUDENT_EMAIL,
  DEMO_STUDENT_PASSWORD,
  seed,
} from "@barready/db/seed";
import { schema } from "@barready/db";
import { and, eq, lt } from "drizzle-orm";
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

function cookieOf(res: { cookies: Array<{ name: string; value: string }> }) {
  const c = res.cookies.find((x) => x.name === "br_session");
  return c ? `br_session=${c.value}` : "";
}
async function login() {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: DEMO_STUDENT_EMAIL, password: DEMO_STUDENT_PASSWORD },
  });
  return cookieOf(res);
}
const json = (r: { json: () => unknown }) => r.json() as never;

async function startAttempt(cookie: string, examId: string) {
  const res = await app.inject({
    method: "POST",
    url: `/exams/${examId}/attempts`,
    headers: { cookie },
  });
  expect(res.statusCode).toBe(200);
  return json(res) as {
    attempt: { id: string };
    sections: Array<{
      examSectionId: string;
      kind: string;
      status: string;
      items: Array<{
        attemptItemId: string;
        selectedChoiceId: string | null;
        flagged: boolean;
        choices: Array<{ id: string }>;
      }>;
    }>;
  };
}

describe("diagnostic exam", () => {
  it("can be taken end-to-end and updates progress", async () => {
    const cookie = await login();
    const state = await startAttempt(cookie, seeded.examIds.diagnostic);
    const attemptId = state.attempt.id;
    const mc = state.sections.find((s) => s.kind === "mbe")!;

    // Start the section, then answer its delivered questions.
    const started = json(
      await app.inject({
        method: "POST",
        url: `/exam-attempts/${attemptId}/sections/start`,
        headers: { cookie },
        payload: { examSectionId: mc.examSectionId },
      }),
    ) as typeof state;
    const items = started.sections.find((s) => s.kind === "mbe")!.items;
    expect(items.length).toBeGreaterThanOrEqual(1);

    for (const it of items) {
      const r = await app.inject({
        method: "POST",
        url: `/exam-attempts/${attemptId}/answer`,
        headers: { cookie },
        payload: {
          attemptItemId: it.attemptItemId,
          selectedChoiceId: it.choices[0]!.id,
          timeMsDelta: 5000,
        },
      });
      expect(r.statusCode).toBe(200);
    }

    const results = json(
      await app.inject({
        method: "POST",
        url: `/exam-attempts/${attemptId}/submit`,
        headers: { cookie },
      }),
    ) as {
      attempt: {
        status: string;
        rawScorePct: number;
        pacing: { answered: number };
      };
    };
    expect(results.attempt.status).toBe("submitted");
    expect(results.attempt.rawScorePct).toBeGreaterThanOrEqual(0);
    expect(results.attempt.pacing.answered).toBe(items.length);

    // Progress snapshot written from the diagnostic.
    const snaps = await db
      .select()
      .from(schema.progressSnapshots)
      .where(
        and(
          eq(schema.progressSnapshots.userId, seeded.studentId),
          eq(schema.progressSnapshots.level, "overall"),
        ),
      );
    expect(snaps.length).toBeGreaterThanOrEqual(1);

    // Canonical question attempts materialized for analytics.
    const qa = await db
      .select()
      .from(schema.questionAttempts)
      .where(eq(schema.questionAttempts.examAttemptId, attemptId));
    expect(qa.length).toBe(items.length);
  });
});

describe("full-length exam with multiple sections", () => {
  it("creates section state for every blueprint section", async () => {
    const cookie = await login();
    const state = await startAttempt(cookie, seeded.examIds.fullLength);
    const kinds = state.sections.map((s) => s.kind).sort();
    expect(kinds).toEqual(["mbe", "mee_essay", "mpt_performance_test"]);
    // Pending sections don't leak their items.
    expect(state.sections.find((s) => s.kind === "mbe")!.items.length).toBe(0);
  });
});

describe("resume + pacing", () => {
  it("resumes the same in-progress attempt and preserves working answers", async () => {
    const cookie = await login();
    const a = await startAttempt(cookie, seeded.examIds.fullLength);
    const mc = a.sections.find((s) => s.kind === "mbe")!;
    const started = json(
      await app.inject({
        method: "POST",
        url: `/exam-attempts/${a.attempt.id}/sections/start`,
        headers: { cookie },
        payload: { examSectionId: mc.examSectionId },
      }),
    ) as typeof a;
    const item = started.sections.find((s) => s.kind === "mbe")!.items[0]!;
    await app.inject({
      method: "POST",
      url: `/exam-attempts/${a.attempt.id}/answer`,
      headers: { cookie },
      payload: {
        attemptItemId: item.attemptItemId,
        selectedChoiceId: item.choices[0]!.id,
      },
    });
    // Change the answer → recorded as a change.
    await app.inject({
      method: "POST",
      url: `/exam-attempts/${a.attempt.id}/answer`,
      headers: { cookie },
      payload: {
        attemptItemId: item.attemptItemId,
        selectedChoiceId: item.choices[1]!.id,
        flagged: true,
      },
    });

    // "Refresh": starting the same exam returns the SAME attempt with the answer.
    const resumed = await startAttempt(cookie, seeded.examIds.fullLength);
    expect(resumed.attempt.id).toBe(a.attempt.id);
    const resumedItem = resumed.sections
      .find((s) => s.kind === "mbe")!
      .items.find((i) => i.attemptItemId === item.attemptItemId)!;
    expect(resumedItem.selectedChoiceId).toBe(item.choices[1]!.id);
    expect(resumedItem.flagged).toBe(true);
  });
});

describe("timing behavior", () => {
  it("auto-submits an expired section and rejects late answers", async () => {
    const cookie = await login();
    const a = await startAttempt(cookie, seeded.examIds.fullLength);
    const mc = a.sections.find((s) => s.kind === "mbe")!;
    const started = json(
      await app.inject({
        method: "POST",
        url: `/exam-attempts/${a.attempt.id}/sections/start`,
        headers: { cookie },
        payload: { examSectionId: mc.examSectionId },
      }),
    ) as typeof a;
    const item = started.sections.find((s) => s.kind === "mbe")!.items[0]!;

    // Force the section deadline into the past (simulate time expiration).
    await db
      .update(schema.examAttemptSections)
      .set({ endsAt: new Date(Date.now() - 1000) })
      .where(
        and(
          eq(schema.examAttemptSections.examAttemptId, a.attempt.id),
          eq(schema.examAttemptSections.examSectionId, mc.examSectionId),
        ),
      );

    // A late answer is rejected with 409.
    const late = await app.inject({
      method: "POST",
      url: `/exam-attempts/${a.attempt.id}/answer`,
      headers: { cookie },
      payload: {
        attemptItemId: item.attemptItemId,
        selectedChoiceId: item.choices[0]!.id,
      },
    });
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe("section_expired");

    // Polling state auto-expires the section.
    const state = json(
      await app.inject({
        method: "GET",
        url: `/exam-attempts/${a.attempt.id}`,
        headers: { cookie },
      }),
    ) as typeof a;
    expect(state.sections.find((s) => s.kind === "mbe")!.status).toBe(
      "expired",
    );

    // Sanity: the forced-past row exists.
    const expired = await db
      .select()
      .from(schema.examAttemptSections)
      .where(lt(schema.examAttemptSections.endsAt, new Date()));
    expect(expired.length).toBeGreaterThanOrEqual(1);
  });
});
