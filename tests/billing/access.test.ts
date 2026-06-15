import { describe, expect, it } from "vitest";

import { evaluateAccess, type AccessProfile } from "@/lib/billing/access";

const NOW = new Date("2026-06-15T12:00:00Z");

function profile(overrides: Partial<AccessProfile>): AccessProfile {
  return {
    plan: "trial",
    stripe_current_period_end: null,
    subscription_renewal_date: null,
    ...overrides,
  };
}

describe("evaluateAccess (PRD §10.10, §10.11)", () => {
  it("allows active paid plans", () => {
    for (const plan of ["starter", "growth", "pro"]) {
      const d = evaluateAccess(profile({ plan }), NOW);
      expect(d).toEqual({ allowed: true, reason: "active" });
    }
  });

  it("allows trial users", () => {
    expect(evaluateAccess(profile({ plan: "trial" }), NOW)).toEqual({
      allowed: true,
      reason: "trial",
    });
  });

  it("keeps access during the payment_failed dunning grace window", () => {
    expect(evaluateAccess(profile({ plan: "payment_failed" }), NOW)).toEqual({
      allowed: true,
      reason: "payment_failed_grace",
    });
  });

  it("allows a cancelled user until the Stripe period end", () => {
    const d = evaluateAccess(
      profile({ plan: "cancelled", stripe_current_period_end: "2026-06-20T00:00:00Z" }),
      NOW,
    );
    expect(d).toEqual({ allowed: true, reason: "grace_period" });
  });

  it("allows a cancelled mobile money user until the renewal date", () => {
    const d = evaluateAccess(
      profile({ plan: "cancelled", subscription_renewal_date: "2026-06-30" }),
      NOW,
    );
    expect(d).toEqual({ allowed: true, reason: "grace_period" });
  });

  it("blocks a cancelled user once the access period has lapsed", () => {
    const d = evaluateAccess(
      profile({ plan: "cancelled", stripe_current_period_end: "2026-06-01T00:00:00Z" }),
      NOW,
    );
    expect(d).toEqual({ allowed: false, reason: "cancelled_expired" });
  });

  it("blocks a cancelled user with no period end on record", () => {
    expect(evaluateAccess(profile({ plan: "cancelled" }), NOW)).toEqual({
      allowed: false,
      reason: "cancelled_expired",
    });
  });

  it("blocks unknown plan values", () => {
    expect(evaluateAccess(profile({ plan: "weird" }), NOW)).toEqual({
      allowed: false,
      reason: "unknown_plan",
    });
  });
});
