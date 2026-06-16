import { describe, expect, it } from "vitest";

import { billingViewState, formatUsd, planCards, type BillingProfile } from "@/lib/billing/view";

const NOW = new Date("2026-06-16T12:00:00Z");

function profile(overrides: Partial<BillingProfile>): BillingProfile {
  return {
    plan: "trial",
    stripe_current_period_end: null,
    subscription_renewal_date: null,
    ...overrides,
  };
}

describe("formatUsd", () => {
  it("renders cents as whole-dollar USD", () => {
    expect(formatUsd(19_700)).toBe("$197");
    expect(formatUsd(197_000)).toBe("$1,970");
  });
});

describe("planCards", () => {
  it("returns the three paid plans with prices, limits, and features", () => {
    const cards = planCards();
    expect(cards.map((c) => c.id)).toEqual(["starter", "growth", "pro"]);
    const starter = cards[0]!;
    expect(starter.monthly).toBe("$197");
    expect(starter.annual).toBe("$1,970");
    expect(starter.competitorLimit).toBe(3);
    expect(starter.features.length).toBeGreaterThan(0);
  });
});

describe("billingViewState (PRD §11.2)", () => {
  it("trial → subscribe", () => {
    expect(billingViewState(profile({ plan: "trial" }), NOW).mode).toBe("subscribe");
  });

  it("paid plan → manage with plan name", () => {
    const v = billingViewState(profile({ plan: "growth" }), NOW);
    expect(v.mode).toBe("manage");
    expect(v.statusLabel).toContain("Growth");
  });

  it("payment_failed → manage", () => {
    expect(billingViewState(profile({ plan: "payment_failed" }), NOW).mode).toBe("manage");
  });

  it("cancelled within paid period → manage (grace)", () => {
    const v = billingViewState(
      profile({ plan: "cancelled", stripe_current_period_end: "2026-06-30T00:00:00Z" }),
      NOW,
    );
    expect(v.mode).toBe("manage");
    expect(v.statusLabel).toContain("access until");
  });

  it("cancelled after period end → subscribe", () => {
    const v = billingViewState(
      profile({ plan: "cancelled", stripe_current_period_end: "2026-06-01T00:00:00Z" }),
      NOW,
    );
    expect(v.mode).toBe("subscribe");
  });
});
