import { describe, it, expect } from "vitest";

import {
  PLAN_COMPETITOR_LIMITS,
  competitorLimitFor,
  planLimitMessage,
} from "@/lib/competitors/limits";

describe("PLAN_COMPETITOR_LIMITS", () => {
  it("matches PRD §7.3", () => {
    expect(PLAN_COMPETITOR_LIMITS.trial).toBe(3);
    expect(PLAN_COMPETITOR_LIMITS.starter).toBe(3);
    expect(PLAN_COMPETITOR_LIMITS.growth).toBe(8);
    expect(PLAN_COMPETITOR_LIMITS.pro).toBe(15);
    expect(PLAN_COMPETITOR_LIMITS.cancelled).toBe(0);
    expect(PLAN_COMPETITOR_LIMITS.payment_failed).toBe(0);
  });
});

describe("competitorLimitFor", () => {
  it("returns 0 for unknown plans", () => {
    expect(competitorLimitFor("nonsense")).toBe(0);
    expect(competitorLimitFor(null)).toBe(0);
    expect(competitorLimitFor(undefined)).toBe(0);
  });

  it("returns the right limit per plan", () => {
    expect(competitorLimitFor("starter")).toBe(3);
    expect(competitorLimitFor("growth")).toBe(8);
    expect(competitorLimitFor("pro")).toBe(15);
  });
});

describe("planLimitMessage", () => {
  it("returns the PRD §7.4 Starter copy verbatim", () => {
    expect(planLimitMessage("starter", 3)).toBe(
      "Your plan includes up to 3 competitors. Upgrade to Growth to track up to 8.",
    );
  });

  it("returns the same copy for trial", () => {
    expect(planLimitMessage("trial", 3)).toBe(
      "Your plan includes up to 3 competitors. Upgrade to Growth to track up to 8.",
    );
  });

  it("returns Growth → Pro upgrade copy", () => {
    expect(planLimitMessage("growth", 8)).toBe(
      "Your plan includes up to 8 competitors. Upgrade to Pro to track up to 15.",
    );
  });

  it("returns a terminal message for Pro", () => {
    expect(planLimitMessage("pro", 15)).toBe("Your Pro plan includes up to 15 competitors.");
  });

  it("returns a reactivation message for cancelled / payment_failed", () => {
    expect(planLimitMessage("cancelled", 0)).toMatch(/reactivate/i);
    expect(planLimitMessage("payment_failed", 0)).toMatch(/reactivate/i);
  });
});
