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

async function getEssayId(cookie: string) {
  const res = await app.inject({
    method: "GET",
    url: `/essays?courseId=${seeded.courseId}`,
    headers: { cookie },
  });
  return res.json().prompts[0].id as string;
}

describe("student essay flow", () => {
  it("submits a timed essay and reveals the model answer + issue checklist", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const essayId = await getEssayId(cookie);

    // Prompt detail does not leak the model answer.
    const detail = await app.inject({
      method: "GET",
      url: `/essays/${essayId}`,
      headers: { cookie },
    });
    expect(detail.json()).not.toHaveProperty("modelAnswer");
    expect(detail.json().rubric.length).toBeGreaterThanOrEqual(1);

    const submitted = await app.inject({
      method: "POST",
      url: `/essays/${essayId}/submissions`,
      headers: { cookie },
      payload: {
        responseText:
          "The statement is hearsay but admissible as a present sense impression...",
        timeSpentSeconds: 1500,
      },
    });
    expect(submitted.statusCode).toBe(200);
    const body = submitted.json();
    expect(body.submissionId).toBeTruthy();
    expect(body.modelAnswer).toBeTruthy(); // revealed after submit
    expect(body.issueChecklist.length).toBeGreaterThanOrEqual(1);

    // Self-assessment + spotted-issue reconciliation.
    const self = await app.inject({
      method: "POST",
      url: `/essay-submissions/${body.submissionId}/self-assessment`,
      headers: { cookie },
      payload: {
        scores: [
          { dimension: "issue_spotting", score: 3 },
          { dimension: "organization", score: 4 },
        ],
        spottedIssueIds: [], // spotted none → all checklist issues missed
      },
    });
    expect(self.statusCode).toBe(200);
    expect(self.json().missedIssueIds.length).toBeGreaterThanOrEqual(1);

    // Essay results feed progress (subject snapshot written).
    const snaps = await db
      .select()
      .from(schema.progressSnapshots)
      .where(
        and(
          eq(schema.progressSnapshots.userId, seeded.studentId),
          eq(schema.progressSnapshots.level, "subject"),
        ),
      );
    expect(snaps.length).toBeGreaterThanOrEqual(1);
  });

  it("exposes essay analytics (dimensions + score trend)", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const res = await app.inject({
      method: "GET",
      url: "/essays/analytics",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const a = res.json();
    const dims = a.dimensions.map((d: { dimension: string }) => d.dimension);
    expect(dims).toContain("issue_spotting");
    expect(dims).toContain("organization");
    expect(dims).toContain("time_management");
    expect(Array.isArray(a.trend)).toBe(true);
  });

  it("AI-feedback seam is present but disabled in beta", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const essayId = await getEssayId(cookie);
    const sub = await app.inject({
      method: "POST",
      url: `/essays/${essayId}/submissions`,
      headers: { cookie },
      payload: { responseText: "Draft answer.", timeSpentSeconds: 600 },
    });
    const res = await app.inject({
      method: "POST",
      url: `/essay-submissions/${sub.json().submissionId}/ai-feedback`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().enabled).toBe(false);
    expect(res.json().feedback).toBeNull();
  });
});

describe("grader workflow", () => {
  it("blocks students from the grading queue", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const res = await app.inject({
      method: "GET",
      url: "/grader/essay-submissions",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets a grader score, comment, and tag missed issues + rule weaknesses", async () => {
    const studentCookie = await login(
      DEMO_STUDENT_EMAIL,
      DEMO_STUDENT_PASSWORD,
    );
    const essayId = await getEssayId(studentCookie);
    const submission = (
      await app.inject({
        method: "POST",
        url: `/essays/${essayId}/submissions`,
        headers: { cookie: studentCookie },
        payload: {
          responseText: "Student essay to be graded.",
          timeSpentSeconds: 1800,
        },
      })
    ).json();

    const graderCookie = await signupAndPromote(
      "grader1@example.com",
      "grader",
    );
    const queue = await app.inject({
      method: "GET",
      url: "/grader/essay-submissions",
      headers: { cookie: graderCookie },
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().submissions.length).toBeGreaterThanOrEqual(1);

    const [issue] = await db.select().from(schema.issues).limit(1);
    const graded = await app.inject({
      method: "POST",
      url: `/grader/essay-submissions/${submission.submissionId}/grade`,
      headers: { cookie: graderCookie },
      payload: {
        scores: [
          {
            dimension: "issue_spotting",
            score: 2,
            notes: "Missed two issues.",
          },
          { dimension: "rule_statement", score: 3 },
          { dimension: "application", score: 2 },
          { dimension: "organization", score: 4 },
          { dimension: "time_management", score: 3 },
        ],
        comment: "Good structure; deepen analysis and spot the minor issues.",
        missedIssueIds: [issue!.id],
        ruleWeaknesses: ["present sense impression timing"],
      },
    });
    expect(graded.statusCode).toBe(200);
    const sub = graded.json().submission;
    expect(sub.feedback).toMatch(/deepen analysis/i);
    expect(sub.graderScores.length).toBe(5);
    expect(sub.graderMeta.ruleWeaknesses).toContain(
      "present sense impression timing",
    );

    // The graded submission shows gradedAt.
    const fetched = await app.inject({
      method: "GET",
      url: `/essay-submissions/${submission.submissionId}`,
      headers: { cookie: graderCookie },
    });
    expect(fetched.json().submission.gradedAt).toBeTruthy();
  });
});
