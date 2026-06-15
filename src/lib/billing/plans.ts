// Plan catalogue — single source of truth for pricing, limits, and the
// mapping between our plan ids and Stripe price ids.
// Source: docs/inteloop-prd.md §10.2 (plan definitions), §7.3 (competitor limits).
//
// This module is pure (no env reads beyond the price-id lookup helper, no
// server-only imports) so it can be shared by route handlers and tests.

export type PaidPlan = "starter" | "growth" | "pro";
export type BillingInterval = "monthly" | "annual";

// Lifecycle states stored in profiles.plan that are not purchasable plans.
export type AccountPlan = PaidPlan | "trial" | "cancelled" | "payment_failed";

export type PlanDefinition = {
  id: PaidPlan;
  name: string;
  competitorLimit: number;
  // Display/charge amounts in the smallest practical unit per currency.
  // USD is stored in cents to match Stripe; KES is whole shillings (no minor
  // unit is billed via mobile money in this product).
  usd: { monthlyCents: number; annualCents: number };
  // Mobile money (Daraja/KCB) only bills monthly — there is no annual KES
  // price in the PRD, and renewals run on a monthly cron (§10.6).
  kes: { monthly: number };
  // Env var names holding the Stripe price ids for each interval.
  stripePriceEnv: Record<BillingInterval, string>;
};

export const PLANS: Record<PaidPlan, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    competitorLimit: 3,
    usd: { monthlyCents: 19_700, annualCents: 197_000 },
    kes: { monthly: 25_500 },
    stripePriceEnv: {
      monthly: "STRIPE_STARTER_MONTHLY_PRICE_ID",
      annual: "STRIPE_STARTER_ANNUAL_PRICE_ID",
    },
  },
  growth: {
    id: "growth",
    name: "Growth",
    competitorLimit: 8,
    usd: { monthlyCents: 39_700, annualCents: 397_000 },
    kes: { monthly: 51_400 },
    stripePriceEnv: {
      monthly: "STRIPE_GROWTH_MONTHLY_PRICE_ID",
      annual: "STRIPE_GROWTH_ANNUAL_PRICE_ID",
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    competitorLimit: 15,
    usd: { monthlyCents: 79_700, annualCents: 797_000 },
    kes: { monthly: 103_100 },
    stripePriceEnv: {
      monthly: "STRIPE_PRO_MONTHLY_PRICE_ID",
      annual: "STRIPE_PRO_ANNUAL_PRICE_ID",
    },
  },
};

export const PAID_PLANS = Object.keys(PLANS) as PaidPlan[];

export function isPaidPlan(value: unknown): value is PaidPlan {
  return typeof value === "string" && value in PLANS;
}

export function getPlan(plan: PaidPlan): PlanDefinition {
  return PLANS[plan];
}

// Resolve the Stripe price id for a plan + interval from the environment.
// Returns null if the env var is unset so callers can return a clean 500/400
// rather than handing `undefined` to the Stripe SDK.
export function stripePriceId(plan: PaidPlan, interval: BillingInterval): string | null {
  return process.env[PLANS[plan].stripePriceEnv[interval]] ?? null;
}

// Reverse lookup: given a Stripe price id seen on a webhook, find the plan it
// belongs to. Used by customer.subscription.updated to reflect upgrades.
export function planFromStripePriceId(priceId: string): PaidPlan | null {
  for (const plan of PAID_PLANS) {
    const env = PLANS[plan].stripePriceEnv;
    if (process.env[env.monthly] === priceId || process.env[env.annual] === priceId) {
      return plan;
    }
  }
  return null;
}

// KES amount charged via mobile money. Mobile money is monthly-only; an
// annual interval is rejected upstream (schemas), but we guard here too.
export function mobileMoneyAmount(plan: PaidPlan, interval: BillingInterval): number | null {
  if (interval !== "monthly") return null;
  return PLANS[plan].kes.monthly;
}
