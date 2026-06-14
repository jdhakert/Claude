/** Pricing placeholders — no secrets, no live charges (Phase 18 §4). */
export interface Plan {
  id: string;
  name: string;
  priceMonthlyUsd: number;
  features: string[];
  entitlements: string[];
}

export const PLANS: Plan[] = [
  {
    id: "beta_free",
    name: "Beta (invite-only)",
    priceMonthlyUsd: 0,
    features: ["Full UBE course", "Adaptive plan", "All practice + exams"],
    entitlements: ["ube-2026"],
  },
  {
    id: "standard",
    name: "Standard",
    priceMonthlyUsd: 49,
    features: ["Everything in Beta", "Essay & PT feedback workflow"],
    entitlements: ["ube-2026"],
  },
  {
    id: "premium",
    name: "Premium",
    priceMonthlyUsd: 99,
    features: ["Everything in Standard", "Multi-jurisdiction access"],
    entitlements: ["ube-2026", "california-2026"],
  },
];

export function planById(id: string): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null;
}
