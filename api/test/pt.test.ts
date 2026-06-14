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
async function taskId(cookie: string) {
  const res = await app.inject({
    method: "GET",
    url: `/pt-tasks?courseId=${seeded.courseId}`,
    headers: { cookie },
  });
  return res.json().tasks[0].id as string;
}

describe("student PT flow", () => {
  it("serves a task with File + Library documents (closed universe)", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const id = await taskId(cookie);
    const res = await app.inject({
      method: "GET",
      url: `/pt-tasks/${id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const task = res.json();
    expect(task.expectedProduct).toMatch(/memorandum/i);
    expect(task.files.length).toBeGreaterThanOrEqual(1);
    expect(task.library.length).toBeGreaterThanOrEqual(1);
    // Model work product is NOT leaked before submission.
    expect(task).not.toHaveProperty("modelWorkProduct");
  });

  it("submits a timed PT, reveals model work product, and self-assesses", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const id = await taskId(cookie);
    const submitted = await app.inject({
      method: "POST",
      url: `/pt-tasks/${id}/submissions`,
      headers: { cookie },
      payload: {
        responseText: "MEMORANDUM\nThe statement is admissible under §80.3...",
        timeSpentSeconds: 5000,
      },
    });
    expect(submitted.statusCode).toBe(200);
    const body = submitted.json();
    expect(body.modelWorkProduct).toBeTruthy();
    expect(body.rubric).toContain("rule_extraction");

    const self = await app.inject({
      method: "POST",
      url: `/pt-submissions/${body.submissionId}/self-assessment`,
      headers: { cookie },
      payload: {
        scores: [
          { dimension: "organization", score: 3 },
          { dimension: "fact_use", score: 2 },
        ],
      },
    });
    expect(self.statusCode).toBe(200);

    // Results feed progress (overall snapshot written).
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
  });

  it("exposes PT analytics with all grading dimensions", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const res = await app.inject({
      method: "GET",
      url: "/pt/analytics",
      headers: { cookie },
    });
    const dims = res
      .json()
      .dimensions.map((d: { dimension: string }) => d.dimension);
    expect(dims).toEqual([
      "organization",
      "rule_extraction",
      "fact_use",
      "task_compliance",
      "product_format",
      "completeness",
    ]);
  });
});

describe("PT grading workflow", () => {
  it("blocks students and lets a grader score across all dimensions", async () => {
    const studentCookie = await login(
      DEMO_STUDENT_EMAIL,
      DEMO_STUDENT_PASSWORD,
    );
    const blocked = await app.inject({
      method: "GET",
      url: "/grader/pt-submissions",
      headers: { cookie: studentCookie },
    });
    expect(blocked.statusCode).toBe(403);

    const id = await taskId(studentCookie);
    const sub = (
      await app.inject({
        method: "POST",
        url: `/pt-tasks/${id}/submissions`,
        headers: { cookie: studentCookie },
        payload: { responseText: "PT to be graded.", timeSpentSeconds: 4200 },
      })
    ).json();

    const graderCookie = await signupAndPromote(
      "ptgrader@example.com",
      "grader",
    );
    const queue = await app.inject({
      method: "GET",
      url: "/grader/pt-submissions",
      headers: { cookie: graderCookie },
    });
    expect(queue.json().submissions.length).toBeGreaterThanOrEqual(1);

    const graded = await app.inject({
      method: "POST",
      url: `/grader/pt-submissions/${sub.submissionId}/grade`,
      headers: { cookie: graderCookie },
      payload: {
        scores: [
          { dimension: "organization", score: 4 },
          {
            dimension: "rule_extraction",
            score: 3,
            notes: "Cited §80.3 well.",
          },
          { dimension: "fact_use", score: 3 },
          { dimension: "task_compliance", score: 4 },
          { dimension: "product_format", score: 5 },
          { dimension: "completeness", score: 3 },
        ],
        comment: "Solid memo; tighten the fact application.",
        ruleWeaknesses: ["present sense impression contemporaneity"],
      },
    });
    expect(graded.statusCode).toBe(200);
    expect(graded.json().submission.graderScores.length).toBe(6);
    expect(graded.json().submission.feedback).toMatch(/tighten the fact/i);
  });
});
