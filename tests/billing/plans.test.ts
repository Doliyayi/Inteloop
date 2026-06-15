import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getPlan,
  isPaidPlan,
  mobileMoneyAmount,
  PAID_PLANS,
  planFromStripePriceId,
  stripePriceId,
} from "@/lib/billing/plans";

const ENV_KEYS = [
  "STRIPE_STARTER_MONTHLY_PRICE_ID",
  "STRIPE_STARTER_ANNUAL_PRICE_ID",
  "STRIPE_GROWTH_MONTHLY_PRICE_ID",
  "STRIPE_GROWTH_ANNUAL_PRICE_ID",
  "STRIPE_PRO_MONTHLY_PRICE_ID",
  "STRIPE_PRO_ANNUAL_PRICE_ID",
] as const;

describe("billing plans (PRD §10.2, §7.3)", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      original[k] = process.env[k];
    }
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = "price_starter_m";
    process.env.STRIPE_STARTER_ANNUAL_PRICE_ID = "price_starter_a";
    process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID = "price_growth_m";
    process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID = "price_growth_a";
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = "price_pro_m";
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID = "price_pro_a";
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it("exposes the three paid plans with PRD competitor limits", () => {
    expect(PAID_PLANS).toEqual(["starter", "growth", "pro"]);
    expect(getPlan("starter").competitorLimit).toBe(3);
    expect(getPlan("growth").competitorLimit).toBe(8);
    expect(getPlan("pro").competitorLimit).toBe(15);
  });

  it("uses the PRD KES monthly prices for mobile money", () => {
    expect(mobileMoneyAmount("starter", "monthly")).toBe(25_500);
    expect(mobileMoneyAmount("growth", "monthly")).toBe(51_400);
    expect(mobileMoneyAmount("pro", "monthly")).toBe(103_100);
  });

  it("rejects annual interval for mobile money (monthly-only)", () => {
    expect(mobileMoneyAmount("starter", "annual")).toBeNull();
  });

  it("resolves Stripe price ids per plan + interval from env", () => {
    expect(stripePriceId("starter", "monthly")).toBe("price_starter_m");
    expect(stripePriceId("pro", "annual")).toBe("price_pro_a");
  });

  it("returns null when a price env var is unset", () => {
    delete process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
    expect(stripePriceId("pro", "annual")).toBeNull();
  });

  it("reverse-maps a Stripe price id to its plan", () => {
    expect(planFromStripePriceId("price_growth_m")).toBe("growth");
    expect(planFromStripePriceId("price_pro_a")).toBe("pro");
    expect(planFromStripePriceId("price_unknown")).toBeNull();
  });

  it("guards isPaidPlan against lifecycle states", () => {
    expect(isPaidPlan("starter")).toBe(true);
    expect(isPaidPlan("trial")).toBe(false);
    expect(isPaidPlan("cancelled")).toBe(false);
    expect(isPaidPlan(123)).toBe(false);
  });
});
