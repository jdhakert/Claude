import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { requireAuth, requireRole } from "../auth/guards.js";
import { PLANS, planById } from "../services/billing/plans.js";
import {
  activateSubscription,
  getSubscription,
} from "../services/billing/subscriptions.js";
import { makePaymentProvider } from "../services/billing/payments.js";
import {
  BetaError,
  createInvite,
  listInvites,
  redeemInvite,
  revokeInvite,
  setBetaAccess,
} from "../services/billing/beta.js";

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  // --- Pricing + subscription ---
  app.get("/billing/plans", async () => ({ plans: PLANS }));

  app.get(
    "/billing/subscription",
    { preHandler: requireAuth },
    async (request) => ({
      subscription: await getSubscription(app.db, request.user!.id),
    }),
  );

  const provider = () => makePaymentProvider(process.env.STRIPE_SECRET_KEY);

  // Start checkout. In stub mode (no secret) this returns a mock URL.
  const CheckoutSchema = z.object({ plan: z.string() });
  app.post(
    "/billing/checkout",
    { preHandler: requireAuth },
    async (request) => {
      const parsed = CheckoutSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid plan.");
      if (!planById(parsed.data.plan))
        throw new AppError(404, "not_found", "Unknown plan.");
      const result = await provider().createCheckout({
        plan: parsed.data.plan,
        userId: request.user!.id,
      });
      return result;
    },
  );

  // Stub-only: complete a mock checkout → activate the subscription. Disabled
  // when a live provider is configured (real payment must use the webhook).
  app.post(
    "/billing/checkout/complete",
    { preHandler: requireAuth },
    async (request) => {
      if (provider().enabled)
        throw new AppError(
          409,
          "live_provider",
          "A live payment provider is configured; use the real checkout flow.",
        );
      const parsed = CheckoutSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "bad_request", "Invalid plan.");
      const sub = await activateSubscription(
        app.db,
        request.user!.id,
        parsed.data.plan,
      );
      if (!sub) throw new AppError(404, "not_found", "Unknown plan.");
      return { subscription: sub };
    },
  );

  // --- Beta access (student) ---
  const RedeemSchema = z.object({ code: z.string().min(3) });
  app.post("/beta/redeem", { preHandler: requireAuth }, async (request) => {
    const parsed = RedeemSchema.safeParse(request.body);
    if (!parsed.success)
      throw new AppError(400, "bad_request", "Invalid code.");
    try {
      return await redeemInvite(app.db, request.user!.id, parsed.data.code);
    } catch (err) {
      if (err instanceof BetaError)
        throw new AppError(400, err.code, err.message);
      throw err;
    }
  });

  // --- Beta admin ---
  const adminGuard = { preHandler: requireRole("admin") };

  app.get("/admin/beta/invites", adminGuard, async () => ({
    invites: await listInvites(app.db),
  }));

  const InviteSchema = z.object({
    email: z.string().email().optional(),
    note: z.string().optional(),
  });
  app.post("/admin/beta/invites", adminGuard, async (request) => {
    const parsed = InviteSchema.safeParse(request.body ?? {});
    if (!parsed.success)
      throw new AppError(400, "bad_request", "Invalid invite.");
    return {
      invite: await createInvite(app.db, request.user!.id, parsed.data),
    };
  });

  app.post("/admin/beta/invites/:id/revoke", adminGuard, async (request) => {
    const { id } = request.params as { id: string };
    const revoked = await revokeInvite(app.db, id);
    if (!revoked)
      throw new AppError(404, "not_found", "Active invite not found.");
    return { invite: revoked };
  });

  const GrantSchema = z.object({ grant: z.boolean() });
  app.post("/admin/users/:id/beta", adminGuard, async (request) => {
    const { id } = request.params as { id: string };
    const parsed = GrantSchema.safeParse(request.body);
    if (!parsed.success)
      throw new AppError(400, "bad_request", "Invalid request.");
    const result = await setBetaAccess(
      app.db,
      request.user!.id,
      id,
      parsed.data.grant,
    );
    if (!result) throw new AppError(404, "not_found", "User not found.");
    return { user: result };
  });
}
