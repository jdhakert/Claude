/**
 * Payment-provider abstraction (Phase 18 §3/§4).
 *
 * Beta requires NO live payment secrets. With no `STRIPE_SECRET_KEY` the stub
 * provider is used: it never charges and returns a mock checkout URL. A real
 * Stripe provider can be dropped in behind this seam without touching callers,
 * and is only constructed when a secret is actually supplied.
 */
export interface CheckoutResult {
  provider: string;
  /** Where to send the user to "pay" (a mock URL in stub mode). */
  url: string;
  stubbed: boolean;
}

export interface PaymentProvider {
  readonly name: string;
  readonly enabled: boolean;
  createCheckout(input: {
    plan: string;
    userId: string;
  }): Promise<CheckoutResult>;
}

/** Default: safe, no-charge stub. */
export class StubPaymentProvider implements PaymentProvider {
  readonly name = "stub";
  readonly enabled = false;
  async createCheckout({ plan }: { plan: string }): Promise<CheckoutResult> {
    return {
      provider: this.name,
      url: `/billing/mock-checkout?plan=${encodeURIComponent(plan)}`,
      stubbed: true,
    };
  }
}

/**
 * Placeholder for the real provider — intentionally NOT wired to the live SDK in
 * beta. Selecting it requires a secret; until the SDK is integrated it behaves
 * like a configured-but-not-live provider.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  readonly enabled = true;
  constructor(private readonly secretKey: string) {}
  async createCheckout(): Promise<CheckoutResult> {
    // A real integration would call Stripe Checkout here using this.secretKey.
    void this.secretKey;
    throw new Error(
      "Stripe integration is not enabled in this build. Provide the SDK wiring before going live.",
    );
  }
}

/** Choose a provider based on whether a secret is configured. */
export function makePaymentProvider(secretKey?: string): PaymentProvider {
  return secretKey
    ? new StripePaymentProvider(secretKey)
    : new StubPaymentProvider();
}
