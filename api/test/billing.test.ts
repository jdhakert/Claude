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
  // Ensure stub mode (no payment secret).
  delete process.env.STRIPE_SECRET_KEY;
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
async function signupAndPromote(email: string, role?: string) {
  await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { email, password: "password1234" },
  });
  const [u] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email));
  if (role) await assignRoleByKey(db as never, u!.id, role);
  return { cookie: await login(email, "password1234"), userId: u!.id };
}

describe("pricing + stubbed payments", () => {
  it("exposes pricing placeholders without secrets", async () => {
    const res = await app.inject({ method: "GET", url: "/billing/plans" });
    expect(res.statusCode).toBe(200);
    const plans = res.json().plans;
    expect(plans.length).toBeGreaterThanOrEqual(2);
    expect(plans[0]).toHaveProperty("priceMonthlyUsd");
  });

  it("checkout runs in safe stub mode and completing it activates a subscription", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const checkout = await app.inject({
      method: "POST",
      url: "/billing/checkout",
      headers: { cookie },
      payload: { plan: "standard" },
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().stubbed).toBe(true);
    expect(checkout.json().provider).toBe("stub");

    const complete = await app.inject({
      method: "POST",
      url: "/billing/checkout/complete",
      headers: { cookie },
      payload: { plan: "standard" },
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().subscription.status).toBe("active");
    expect(complete.json().subscription.plan).toBe("standard");
  });
});

describe("beta invites + access control", () => {
  it("a non-beta user cannot enroll, but can after redeeming an invite", async () => {
    // Fresh user has no beta access.
    const { cookie } = await signupAndPromote("invitee@example.com");
    const course = (
      await app.inject({ method: "GET", url: "/courses", headers: { cookie } })
    ).json().courses[0];

    const blocked = await app.inject({
      method: "POST",
      url: `/courses/${course.id}/enroll`,
      headers: { cookie },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("beta_required");

    // Admin issues an invite.
    const { cookie: adminCookie } = await signupAndPromote(
      "beta.admin@example.com",
      "admin",
    );
    const invite = (
      await app.inject({
        method: "POST",
        url: "/admin/beta/invites",
        headers: { cookie: adminCookie },
        payload: { note: "pilot cohort" },
      })
    ).json().invite;
    expect(invite.code).toMatch(/^BETA-/);

    // User redeems it → gains access → can enroll.
    const redeem = await app.inject({
      method: "POST",
      url: "/beta/redeem",
      headers: { cookie },
      payload: { code: invite.code },
    });
    expect(redeem.statusCode).toBe(200);
    expect(redeem.json().betaAccess).toBe(true);

    const enrolled = await app.inject({
      method: "POST",
      url: `/courses/${course.id}/enroll`,
      headers: { cookie },
    });
    expect(enrolled.statusCode).toBe(200);

    // A code cannot be redeemed twice.
    const again = await app.inject({
      method: "POST",
      url: "/beta/redeem",
      headers: { cookie },
      payload: { code: invite.code },
    });
    expect(again.statusCode).toBe(400);
  });

  it("admin can grant and revoke beta access directly", async () => {
    const { cookie: adminCookie } = await signupAndPromote(
      "beta.admin2@example.com",
      "admin",
    );
    const { userId } = await signupAndPromote("target@example.com");

    const grant = await app.inject({
      method: "POST",
      url: `/admin/users/${userId}/beta`,
      headers: { cookie: adminCookie },
      payload: { grant: true },
    });
    expect(grant.json().user.betaAccess).toBe(true);

    const revoke = await app.inject({
      method: "POST",
      url: `/admin/users/${userId}/beta`,
      headers: { cookie: adminCookie },
      payload: { grant: false },
    });
    expect(revoke.json().user.betaAccess).toBe(false);
  });

  it("blocks non-admins from beta administration", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const res = await app.inject({
      method: "POST",
      url: "/admin/beta/invites",
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("account management", () => {
  it("returns the composite account and updates profile + notifications", async () => {
    const cookie = await login(DEMO_STUDENT_EMAIL, DEMO_STUDENT_PASSWORD);
    const account = (
      await app.inject({ method: "GET", url: "/account", headers: { cookie } })
    ).json();
    expect(account.user.email).toBe(DEMO_STUDENT_EMAIL);
    expect(account.user.betaAccess).toBe(true);
    expect(account.enrollments.length).toBeGreaterThanOrEqual(1);
    expect(account.profile).toHaveProperty("notificationPrefs");

    const updated = await app.inject({
      method: "PATCH",
      url: "/account/profile",
      headers: { cookie },
      payload: { displayName: "Dana R.", studyHoursPerWeek: 25 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().profile.displayName).toBe("Dana R.");
    expect(updated.json().profile.weeklyTimeBudgetMinutes).toBe("1500");

    const notif = await app.inject({
      method: "PATCH",
      url: "/account/notifications",
      headers: { cookie },
      payload: { prefs: { dailyReminder: false, examCountdown: true } },
    });
    expect(notif.statusCode).toBe(200);
    expect(notif.json().notificationPrefs.dailyReminder).toBe(false);

    void seeded;
  });
});
