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
  return { cookie: await login(email, "password1234"), userId: u!.id };
}

async function importItem(authorCookie: string) {
  const [subtopic] = await db.select().from(schema.subtopics).limit(1);
  const res = await app.inject({
    method: "POST",
    url: "/admin/items",
    headers: { cookie: authorCookie },
    payload: {
      subtopicId: subtopic!.id,
      stem: "A new original question authored for the CMS lifecycle test.",
      source: { name: "BarReady Original", provenance: "original" },
      jurisdiction: "ube",
      choices: [
        { label: "A", body: "Right", isCorrect: true, rationale: "Yes." },
        { label: "B", body: "Wrong", isCorrect: false, rationale: "No." },
      ],
      explanation: "Original explanation.",
    },
  });
  return res.json().item.id as string;
}

describe("admin CMS dashboard + search", () => {
  it("blocks students and shows counts + filterable lists for content roles", async () => {
    const studentCookie = await login(
      DEMO_STUDENT_EMAIL,
      DEMO_STUDENT_PASSWORD,
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/admin/cms/dashboard",
          headers: { cookie: studentCookie },
        })
      ).statusCode,
    ).toBe(403);

    const { cookie } = await signupAndPromote(
      "cms.author@example.com",
      "content_author",
    );
    const dash = await app.inject({
      method: "GET",
      url: "/admin/cms/dashboard",
      headers: { cookie },
    });
    expect(dash.statusCode).toBe(200);
    const kinds = dash.json().summary.map((s: { kind: string }) => s.kind);
    expect(kinds).toContain("question");
    expect(kinds).toContain("lesson");

    // Seed content is published; filter by status + search.
    const published = await app.inject({
      method: "GET",
      url: "/admin/cms/question?status=published",
      headers: { cookie },
    });
    expect(published.json().items.length).toBeGreaterThanOrEqual(1);
    const search = await app.inject({
      method: "GET",
      url: "/admin/cms/question?q=balloon",
      headers: { cookie },
    });
    expect(search.json().items.length).toBeGreaterThanOrEqual(1);
  });
});

describe("CMS lifecycle: draft → in_review → approved → published", () => {
  it("walks a question through the lifecycle and publishes it (becomes student-visible)", async () => {
    const { cookie: authorCookie } = await signupAndPromote(
      "cms.author2@example.com",
      "content_author",
    );
    const itemId = await importItem(authorCookie);

    const tx = (action: string, cookie: string) =>
      app.inject({
        method: "POST",
        url: `/admin/cms/question/${itemId}/transition`,
        headers: { cookie },
        payload: { action },
      });

    // Author submits for review.
    expect(
      (await tx("submit", authorCookie)).json().content.contentStatus,
    ).toBe("in_review");

    // Authors cannot approve/publish.
    expect((await tx("approve", authorCookie)).statusCode).toBe(403);

    const { cookie: reviewerCookie } = await signupAndPromote(
      "cms.reviewer@example.com",
      "content_reviewer",
    );
    expect(
      (await tx("approve", reviewerCookie)).json().content.contentStatus,
    ).toBe("approved");
    const published = await tx("publish", reviewerCookie);
    expect(published.json().content.contentStatus).toBe("published");
    expect(published.json().content.licenseStatus).toBe("cleared");

    // History records the transitions.
    const hist = await app.inject({
      method: "GET",
      url: `/admin/cms/question/${itemId}/history`,
      headers: { cookie: reviewerCookie },
    });
    expect(hist.json().history.length).toBeGreaterThanOrEqual(2);
  });
});

describe("acceptance guards", () => {
  it("unapproved content is NOT visible to students", async () => {
    const { cookie: authorCookie } = await signupAndPromote(
      "cms.author3@example.com",
      "content_author",
    );
    const itemId = await importItem(authorCookie); // draft, license in_review

    // Student practice never surfaces the un-published item.
    const studentCookie = await login(
      DEMO_STUDENT_EMAIL,
      DEMO_STUDENT_PASSWORD,
    );
    const items = (
      await app.inject({
        method: "GET",
        url: `/practice/items?courseId=${seeded.courseId}&limit=50`,
        headers: { cookie: studentCookie },
      })
    ).json().items;
    expect(items.some((i: { id: string }) => i.id === itemId)).toBe(false);
  });

  it("missing license/reviewer metadata blocks publication", async () => {
    const { cookie: authorCookie } = await signupAndPromote(
      "cms.author4@example.com",
      "content_author",
    );
    const itemId = await importItem(authorCookie);
    // Force an 'approved' status WITHOUT a reviewer (simulate metadata gap).
    await db
      .update(schema.items)
      .set({ contentStatus: "approved", reviewerId: null })
      .where(eq(schema.items.id, itemId));

    const { cookie: reviewerCookie } = await signupAndPromote(
      "cms.reviewer2@example.com",
      "content_reviewer",
    );
    const res = await app.inject({
      method: "POST",
      url: `/admin/cms/question/${itemId}/transition`,
      headers: { cookie: reviewerCookie },
      payload: { action: "publish" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("missing_license_metadata");
  });

  it("archiving a published item removes it from students", async () => {
    const { cookie: authorCookie } = await signupAndPromote(
      "cms.author5@example.com",
      "content_author",
    );
    const itemId = await importItem(authorCookie);
    const { cookie: reviewerCookie } = await signupAndPromote(
      "cms.reviewer3@example.com",
      "content_reviewer",
    );
    const tx = (action: string) =>
      app.inject({
        method: "POST",
        url: `/admin/cms/question/${itemId}/transition`,
        headers: {
          cookie: action === "submit" ? authorCookie : reviewerCookie,
        },
        payload: { action },
      });
    await tx("submit");
    await tx("approve");
    await tx("publish");

    const [beforeArchive] = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.id, itemId));
    expect(beforeArchive!.licenseStatus).toBe("cleared");

    await tx("archive");
    const [afterArchive] = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.id, itemId));
    expect(afterArchive!.contentStatus).toBe("archived");
    expect(afterArchive!.licenseStatus).not.toBe("cleared");
  });
});
