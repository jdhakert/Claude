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

describe("course browsing & enrollment", () => {
  it("lists courses and lets a student enroll", async () => {
    const cookie = await signupAndPromote("learner@example.com", "student");
    const list = await app.inject({
      method: "GET",
      url: "/courses",
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const course = list.json().courses[0];
    expect(course.enrolled).toBe(false);

    const enrolled = await app.inject({
      method: "POST",
      url: `/courses/${course.id}/enroll`,
      headers: { cookie },
    });
    expect(enrolled.statusCode).toBe(200);

    const list2 = await app.inject({
      method: "GET",
      url: "/courses",
      headers: { cookie },
    });
    expect(
      list2.json().courses.find((c: { id: string }) => c.id === course.id)
        .enrolled,
    ).toBe(true);
  });
});

describe("lessons: structural content + completion progress", () => {
  it("serves a cleared lesson with ordered, typed content blocks", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const res = await app.inject({
      method: "GET",
      url: `/lessons/${seeded.lessonId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const { blocks } = res.json();
    const kinds = blocks.map((b: { kind: string }) => b.kind);
    // All eight content-block kinds are stored structurally.
    expect(kinds).toEqual([
      "text",
      "rule_statement",
      "checklist",
      "example",
      "callout",
      "mini_quiz",
      "video",
      "outline_download",
    ]);
  });

  it("tracks start, completion, and time spent — and updates progress", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);

    await app.inject({
      method: "POST",
      url: `/lessons/${seeded.lessonId}/start`,
      headers: { cookie },
    });

    const done = await app.inject({
      method: "POST",
      url: `/lessons/${seeded.lessonId}/complete`,
      headers: { cookie },
      payload: { timeSpentSeconds: 240 },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json().status).toBe("completed");
    expect(done.json().timeSpentSeconds).toBeGreaterThanOrEqual(240);

    // Completion updates progress: the course tree reflects it.
    const tree = await app.inject({
      method: "GET",
      url: `/courses/${seeded.courseId}`,
      headers: { cookie },
    });
    const lesson = tree
      .json()
      .modules.flatMap((m: { lessons: unknown[] }) => m.lessons)
      .find((l: { id: string }) => l.id === seeded.lessonId);
    expect(lesson.progress).toBe("completed");

    // And it is recorded as a learning event.
    const events = await db
      .select()
      .from(schema.learningEvents)
      .where(eq(schema.learningEvents.type, "lesson_completed"));
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

describe("admin/content-author authoring + licensing gate + preview", () => {
  it("blocks students from authoring endpoints", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const res = await app.inject({
      method: "POST",
      url: "/admin/courses",
      headers: { cookie },
      payload: {
        slug: "x",
        title: "x",
        type: "ube",
        jurisdiction: "ube",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets a content author create and edit a full course tree", async () => {
    const cookie = await signupAndPromote(
      "author2@example.com",
      "content_author",
    );

    const course = (
      await app.inject({
        method: "POST",
        url: "/admin/courses",
        headers: { cookie },
        payload: {
          slug: "mbe-only-2026",
          title: "MBE-Only 2026",
          type: "mbe_only",
          jurisdiction: "mbe",
          description: "Authored in test.",
        },
      })
    ).json().course;
    expect(course.id).toBeTruthy();

    const module = (
      await app.inject({
        method: "POST",
        url: `/admin/courses/${course.id}/modules`,
        headers: { cookie },
        payload: { title: "Torts Module" },
      })
    ).json().module;

    const lesson = (
      await app.inject({
        method: "POST",
        url: `/admin/modules/${module.id}/lessons`,
        headers: { cookie },
        payload: { title: "Negligence", jurisdiction: "mbe" },
      })
    ).json().lesson;
    // New content is NOT cleared (licensing gate).
    expect(lesson.licenseStatus).toBe("in_review");

    const block = (
      await app.inject({
        method: "POST",
        url: `/admin/lessons/${lesson.id}/blocks`,
        headers: { cookie },
        payload: {
          kind: "checklist",
          body: {
            title: "Elements",
            items: ["Duty", "Breach", "Causation", "Damages"],
          },
        },
      })
    ).json().block;
    expect(block.id).toBeTruthy();

    // Edit the block.
    const edited = await app.inject({
      method: "PATCH",
      url: `/admin/blocks/${block.id}`,
      headers: { cookie },
      payload: { body: { title: "Elements of negligence", items: ["Duty"] } },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().block.body.title).toBe("Elements of negligence");

    // Students cannot see the un-cleared lesson...
    const studentCookie = await login(
      DEMO_STUDENT_EMAIL,
      DEMO_STUDENT_PASSWORD,
    );
    const blocked = await app.inject({
      method: "GET",
      url: `/lessons/${lesson.id}`,
      headers: { cookie: studentCookie },
    });
    expect(blocked.statusCode).toBe(404);

    // ...but the author can PREVIEW it.
    const preview = await app.inject({
      method: "GET",
      url: `/lessons/${lesson.id}?preview=true`,
      headers: { cookie },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().lesson.preview).toBe(true);
    expect(preview.json().blocks.length).toBe(1);

    // The authoring tree shows the un-cleared lesson.
    const tree = await app.inject({
      method: "GET",
      url: `/admin/courses/${course.id}/tree`,
      headers: { cookie },
    });
    const lessons = tree
      .json()
      .modules.flatMap((m: { lessons: unknown[] }) => m.lessons);
    expect(lessons.some((l: { id: string }) => l.id === lesson.id)).toBe(true);
  });
});
