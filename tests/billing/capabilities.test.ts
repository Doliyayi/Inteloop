import { describe, expect, it } from "vitest";

import { capabilitiesFor, hasCapability, requirePlanCapability } from "@/lib/billing/capabilities";

describe("capabilitiesFor (PRD §10.2, §7.3)", () => {
  it("competitor limits match the plan definitions", () => {
    expect(capabilitiesFor("trial").competitorLimit).toBe(3);
    expect(capabilitiesFor("starter").competitorLimit).toBe(3);
    expect(capabilitiesFor("growth").competitorLimit).toBe(8);
    expect(capabilitiesFor("pro").competitorLimit).toBe(15);
    expect(capabilitiesFor("cancelled").competitorLimit).toBe(0);
    expect(capabilitiesFor("payment_failed").competitorLimit).toBe(0);
    expect(capabilitiesFor("nonsense").competitorLimit).toBe(0);
    expect(capabilitiesFor(null).competitorLimit).toBe(0);
  });

  it("white-label is Growth and Pro only", () => {
    expect(capabilitiesFor("starter").whiteLabel).toBe(false);
    expect(capabilitiesFor("growth").whiteLabel).toBe(true);
    expect(capabilitiesFor("pro").whiteLabel).toBe(true);
    expect(capabilitiesFor("trial").whiteLabel).toBe(false);
  });

  it("battlecards, API access, and daily briefing are Pro only", () => {
    for (const key of ["battlecards", "apiAccess", "dailyBriefing"] as const) {
      expect(capabilitiesFor("growth")[key]).toBe(false);
      expect(capabilitiesFor("pro")[key]).toBe(true);
    }
  });

  it("real-time alerts are Growth and Pro", () => {
    expect(capabilitiesFor("starter").realTimeAlerts).toBe(false);
    expect(capabilitiesFor("growth").realTimeAlerts).toBe(true);
    expect(capabilitiesFor("pro").realTimeAlerts).toBe(true);
  });

  it("active reflects whether the plan grants service", () => {
    expect(capabilitiesFor("trial").active).toBe(true);
    expect(capabilitiesFor("starter").active).toBe(true);
    expect(capabilitiesFor("cancelled").active).toBe(false);
    expect(capabilitiesFor("payment_failed").active).toBe(false);
  });
});

describe("hasCapability + requirePlanCapability", () => {
  it("hasCapability reads the matrix", () => {
    expect(hasCapability("pro", "apiAccess")).toBe(true);
    expect(hasCapability("starter", "apiAccess")).toBe(false);
  });

  it("requirePlanCapability gates with a 403 when lacking", () => {
    expect(requirePlanCapability("pro", "battlecards")).toEqual({ ok: true });
    const denied = requirePlanCapability("starter", "battlecards");
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.status).toBe(403);
  });
});
