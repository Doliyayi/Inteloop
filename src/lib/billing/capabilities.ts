import { PLANS, type PaidPlan } from "./plans";

// Central plan-capability model (PRD §10.2 features + §7.3 limits).
// Single source of truth for tier gating — competitor limits, white-label,
// battlecards, API access, daily briefing, real-time alerts. Pure module so
// it's shared by routes, pages, components, and tests.

export type FeatureKey =
  | "whiteLabel"
  | "customSenderDomain"
  | "battlecards"
  | "apiAccess"
  | "dailyBriefing"
  | "realTimeAlerts";

export type PlanCapabilities = {
  // Whether the plan grants active service (false during cancelled/expired).
  active: boolean;
  competitorLimit: number;
} & Record<FeatureKey, boolean>;

const NO_FEATURES: Record<FeatureKey, boolean> = {
  whiteLabel: false,
  customSenderDomain: false,
  battlecards: false,
  apiAccess: false,
  dailyBriefing: false,
  realTimeAlerts: false,
};

// Per-paid-plan feature matrix from §10.2. Competitor limits come from PLANS so
// there's one source for the numbers.
const PAID_FEATURES: Record<PaidPlan, Record<FeatureKey, boolean>> = {
  starter: { ...NO_FEATURES },
  growth: {
    ...NO_FEATURES,
    whiteLabel: true,
    customSenderDomain: true,
    realTimeAlerts: true,
  },
  pro: {
    whiteLabel: true,
    customSenderDomain: true,
    realTimeAlerts: true,
    battlecards: true,
    apiAccess: true,
    dailyBriefing: true,
  },
};

const INACTIVE: PlanCapabilities = { active: false, competitorLimit: 0, ...NO_FEATURES };

export function capabilitiesFor(plan: string | null | undefined): PlanCapabilities {
  if (plan && plan in PLANS) {
    const id = plan as PaidPlan;
    return {
      active: true,
      competitorLimit: PLANS[id].competitorLimit,
      ...PAID_FEATURES[id],
    };
  }
  // Trial gets Starter-level tracking but no premium features.
  if (plan === "trial") {
    return { active: true, competitorLimit: PLANS.starter.competitorLimit, ...NO_FEATURES };
  }
  // cancelled / payment_failed / unknown → no entitlements.
  return INACTIVE;
}

export function hasCapability(plan: string | null | undefined, key: FeatureKey): boolean {
  return capabilitiesFor(plan)[key];
}

export type CapabilityGate = { ok: true } | { ok: false; status: number; error: string };

// Server-side guard for premium routes/actions (white-label, battlecards, API).
// Returns a 403 result with upgrade copy when the plan lacks the capability.
export function requirePlanCapability(
  plan: string | null | undefined,
  key: FeatureKey,
): CapabilityGate {
  if (hasCapability(plan, key)) return { ok: true };
  return {
    ok: false,
    status: 403,
    error: "Your plan doesn't include this feature. Upgrade to unlock it.",
  };
}
