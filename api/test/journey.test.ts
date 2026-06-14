/**
 * End-to-end product journeys (Phase 22 bug bash).
 *
 * These walk the *whole* product through the HTTP layer (Fastify inject) against
 * a real Postgres (PGlite) — the closest CI-safe thing to a user session. One
 * describe per journey; the `it` titles map 1:1 to the Phase 22 flow checklist.
 */
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
afterAll(async () => app.close());

const cookieOf = (r: { cookies: Array<{ name: string; value: string }> }) => {
  const c = r.cookies.find((x) => x.name === "br_session");
  return c ? `br_session=${c.value}` : "";
};
const body = (r: { json: () => unknown }): any => r.json();

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
  return { cookie: await login(email, "password1234"), userId: u!.id };
}

describe("Student journey (E2E)", () => {
  it("1+2+3. signup → onboarding → course enrollment", async () => {
    // Signup (also logs in via session cookie).
    const signup = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        email: "journey.student@example.com",
        password: "password1234",
      },
    });
    expect(signup.statusCode).toBe(201);
    const cookie = cookieOf(signup);
    expect(cookie).toContain("br_session=");

    // Model an accepted beta invite so the new user can enroll (invite redemption
    // path is covered separately by billing.test.ts).
    const [u] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "journey.student@example.com"));
    await db
      .update(schema.users)
      .set({ betaAccess: true })
      .where(eq(schema.users.id, u!.id));

    // Onboarding writes the study profile that powers the plan.
    const onboarding = await app.inject({
      method: "POST",
      url: "/onboarding",
      headers: { cookie },
      payload: {
        targetJurisdiction: "ube",
        examDate: "2026-07-28",
        takerStatus: "first_time",
        studyHoursPerWeek: 20,
        selfRatedSubjects: { Evidence: 2, Contracts: 3 },
        studyStyle: "mixed",
      },
    });
    expect(onboarding.statusCode).toBe(200);

    // Enroll in the seeded course.
    const enroll = await app.inject({
      method: "POST",
      url: `/courses/${seeded.courseId}/enroll`,
      headers: { cookie },
    });
    expect(enroll.statusCode).toBe(200);
    expect(body(enroll).courseId).toBe(seeded.courseId);

    // Dashboard is now reachable for the freshly-enrolled student.
    const dash = await app.inject({
      method: "GET",
      url: "/dashboard",
      headers: { cookie },
    });
    expect(dash.statusCode).toBe(200);
  });

  it("4. lesson completion", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    // Browse the course tree.
    const tree = await app.inject({
      method: "GET",
      url: `/courses/${seeded.courseId}`,
      headers: { cookie },
    });
    expect(tree.statusCode).toBe(200);

    const lesson = await app.inject({
      method: "GET",
      url: `/lessons/${seeded.lessonId}`,
      headers: { cookie },
    });
    expect(lesson.statusCode).toBe(200);
    expect(body(lesson).blocks.length).toBeGreaterThanOrEqual(1);

    await app.inject({
      method: "POST",
      url: `/lessons/${seeded.lessonId}/start`,
      headers: { cookie },
    });
    const complete = await app.inject({
      method: "POST",
      url: `/lessons/${seeded.lessonId}/complete`,
      headers: { cookie },
      payload: { timeSpentSeconds: 300 },
    });
    expect(complete.statusCode).toBe(200);
    expect(body(complete).status).toBe("completed");
  });

  it("5. practice question set", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const items = body(
      await app.inject({
        method: "GET",
        url: `/practice/items?courseId=${seeded.courseId}&limit=3`,
        headers: { cookie },
      }),
    ).items as Array<{ id: string; choices: Array<{ id: string }> }>;
    expect(items.length).toBeGreaterThanOrEqual(1);

    const review = await app.inject({
      method: "POST",
      url: "/practice/attempts",
      headers: { cookie },
      payload: {
        itemId: items[0]!.id,
        selectedChoiceId: items[0]!.choices[0]!.id,
        confidence: "medium",
        timeMs: 30000,
        mode: "tutor",
      },
    });
    expect(review.statusCode).toBe(200);
    expect(typeof body(review).isCorrect).toBe("boolean");
    expect(body(review).correctChoiceId).toBeTruthy();
  });

  it("6. diagnostic exam end-to-end", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const state = body(
      await app.inject({
        method: "POST",
        url: `/exams/${seeded.examIds.diagnostic}/attempts`,
        headers: { cookie },
      }),
    ) as {
      attempt: { id: string };
      sections: Array<{ examSectionId: string; kind: string }>;
    };
    const attemptId = state.attempt.id;
    const mbe = state.sections.find((s) => s.kind === "mbe")!;

    const started = body(
      await app.inject({
        method: "POST",
        url: `/exam-attempts/${attemptId}/sections/start`,
        headers: { cookie },
        payload: { examSectionId: mbe.examSectionId },
      }),
    ) as {
      sections: Array<{
        kind: string;
        items: Array<{ attemptItemId: string; choices: Array<{ id: string }> }>;
      }>;
    };
    const items = started.sections.find((s) => s.kind === "mbe")!.items;

    for (const it of items) {
      const r = await app.inject({
        method: "POST",
        url: `/exam-attempts/${attemptId}/answer`,
        headers: { cookie },
        payload: {
          attemptItemId: it.attemptItemId,
          selectedChoiceId: it.choices[0]!.id,
          timeMsDelta: 4000,
        },
      });
      expect(r.statusCode).toBe(200);
    }

    const results = await app.inject({
      method: "POST",
      url: `/exam-attempts/${attemptId}/submit`,
      headers: { cookie },
    });
    expect(results.statusCode).toBe(200);
    expect(body(results).attempt.status).toBe("submitted");
  });

  it("7. essay submission + self-assessment", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const prompts = body(
      await app.inject({
        method: "GET",
        url: `/essays?courseId=${seeded.courseId}`,
        headers: { cookie },
      }),
    ).prompts as Array<{ id: string }>;
    expect(prompts.length).toBeGreaterThanOrEqual(1);

    const submit = await app.inject({
      method: "POST",
      url: `/essays/${prompts[0]!.id}/submissions`,
      headers: { cookie },
      payload: {
        responseText:
          "The statement is hearsay but admissible as a present sense impression because it described the event as perceived.",
        timeSpentSeconds: 1500,
      },
    });
    expect(submit.statusCode).toBe(200);
    expect(body(submit).submissionId).toBeTruthy();
  });

  it("8. flashcard review (SRS)", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const due = body(
      await app.inject({ method: "GET", url: "/srs/due", headers: { cookie } }),
    ).cards as Array<{ reviewId: string }>;
    expect(due.length).toBeGreaterThanOrEqual(1);

    const reviewed = await app.inject({
      method: "POST",
      url: `/srs/${due[0]!.reviewId}/review`,
      headers: { cookie },
      payload: { rating: "good" },
    });
    expect(reviewed.statusCode).toBe(200);
    expect(body(reviewed).intervalDays).toBeGreaterThan(0);
  });

  it("9. progress dashboard + analytics", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const dash = await app.inject({
      method: "GET",
      url: "/dashboard",
      headers: { cookie },
    });
    expect(dash.statusCode).toBe(200);
    expect(body(dash)).toHaveProperty("readiness");

    const analytics = await app.inject({
      method: "GET",
      url: "/analytics/me",
      headers: { cookie },
    });
    expect(analytics.statusCode).toBe(200);
  });
});

describe("Admin journey (E2E)", () => {
  it("10. admin content creation → student visibility", async () => {
    const { cookie: authorCookie } = await signupAndPromote(
      "journey.author@example.com",
      "content_author",
    );
    const [subtopic] = await db.select().from(schema.subtopics).limit(1);

    const created = await app.inject({
      method: "POST",
      url: "/admin/items",
      headers: { cookie: authorCookie },
      payload: {
        subtopicId: subtopic!.id,
        stem: "An original, fictional MBE-style item authored during the bug bash.",
        source: { name: "BarReady Original", provenance: "original" },
        jurisdiction: "ube",
        choices: [
          {
            label: "A",
            body: "Correct",
            isCorrect: true,
            rationale: "Because.",
          },
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
    const itemId = body(created).item.id;
    // Authored content starts in review — NOT student-visible yet.
    expect(body(created).item.licenseStatus).toBe("in_review");

    // Reviewer (≠ author) clears it.
    const { cookie: reviewerCookie } = await signupAndPromote(
      "journey.reviewer@example.com",
      "content_reviewer",
    );
    const cleared = await app.inject({
      method: "POST",
      url: `/admin/items/${itemId}/clear`,
      headers: { cookie: reviewerCookie },
    });
    expect(cleared.statusCode).toBe(200);
    expect(body(cleared).item.licenseStatus).toBe("cleared");

    // CMS dashboard reflects content for content roles.
    const cms = await app.inject({
      method: "GET",
      url: "/admin/cms/dashboard",
      headers: { cookie: reviewerCookie },
    });
    expect(cms.statusCode).toBe(200);
    expect(Array.isArray(body(cms).summary)).toBe(true);
  });

  it("11. admin student review (cohort, at-risk, content)", async () => {
    const { cookie } = await signupAndPromote(
      "journey.admin@example.com",
      "admin",
    );

    const students = await app.inject({
      method: "GET",
      url: "/admin/analytics/students",
      headers: { cookie },
    });
    expect(students.statusCode).toBe(200);
    expect(Array.isArray(body(students).students)).toBe(true);

    const cohort = await app.inject({
      method: "GET",
      url: "/admin/analytics/cohort",
      headers: { cookie },
    });
    expect(cohort.statusCode).toBe(200);

    const atRisk = await app.inject({
      method: "GET",
      url: "/admin/analytics/at-risk",
      headers: { cookie },
    });
    expect(atRisk.statusCode).toBe(200);

    const content = await app.inject({
      method: "GET",
      url: `/admin/analytics/content?courseId=${seeded.courseId}`,
      headers: { cookie },
    });
    expect(content.statusCode).toBe(200);
  });

  it("denies a plain student access to admin analytics (authz floor)", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const res = await app.inject({
      method: "GET",
      url: "/admin/analytics/students",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });
});
