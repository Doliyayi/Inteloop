// Post-subscription access control.
// Source: docs/inteloop-prd.md §10.10 (access after cancellation) and §10.11
// (acceptance criteria).
//
// Pure function — takes the relevant profile columns plus "now" and returns a
// decision. Callers (dashboard layout, report-generation guard) translate a
// `false` into a redirect to the reactivation prompt.

import { isPaidPlan } from "./plans";

export type AccessProfile = {
  plan: string;
  // Stripe-billed subscribers: end of the current paid period.
  stripe_current_period_end: string | null;
  // Mobile money subscribers: date access is paid through (§10.10).
  subscription_renewal_date: string | null;
};

export type AccessReason =
  | "active" // on a paid plan
  | "trial" // free trial, still active
  | "payment_failed_grace" // payment failed but within dunning window (§10.11)
  | "grace_period" // cancelled but paid period not yet ended (§10.10)
  | "cancelled_expired" // cancelled and access period has lapsed — block
  | "unknown_plan";

export type AccessDecision = {
  allowed: boolean;
  reason: AccessReason;
};

// The date the user's paid access runs through, whichever channel they used.
// Stripe's period end takes precedence; mobile money falls back to the
// renewal date. Returns null when neither is set.
function accessPeriodEnd(profile: AccessProfile): Date | null {
  const raw = profile.stripe_current_period_end ?? profile.subscription_renewal_date;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function evaluateAccess(profile: AccessProfile, now: Date = new Date()): AccessDecision {
  if (isPaidPlan(profile.plan)) {
    return { allowed: true, reason: "active" };
  }

  switch (profile.plan) {
    case "trial":
      return { allowed: true, reason: "trial" };

    // Dunning grace: the user keeps access while the three failed-payment
    // emails go out (§10.11). Cancellation flips the plan to 'cancelled'.
    case "payment_failed":
      return { allowed: true, reason: "payment_failed_grace" };

    case "cancelled": {
      const end = accessPeriodEnd(profile);
      if (end && now < end) {
        return { allowed: true, reason: "grace_period" };
      }
      return { allowed: false, reason: "cancelled_expired" };
    }

    default:
      return { allowed: false, reason: "unknown_plan" };
  }
}
