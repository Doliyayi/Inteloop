import { describe, expect, it } from "vitest";

import {
  brandedFromAddress,
  DEFAULT_BRANDING,
  effectiveBranding,
  type WhiteLabelProfile,
} from "@/lib/whitelabel/branding";
import { whiteLabelUpdateSchema } from "@/lib/whitelabel/schemas";

function profile(overrides: Partial<WhiteLabelProfile>): WhiteLabelProfile {
  return {
    plan: "growth",
    white_label_enabled: true,
    white_label_sender_name: "Agency Insights",
    white_label_logo_url: "https://agency.example/logo.png",
    white_label_footer_text: "Sent by Agency Insights",
    ...overrides,
  };
}

describe("effectiveBranding (PRD §13)", () => {
  it("applies agency branding for an enabled Growth subscriber", () => {
    const b = effectiveBranding(profile({}));
    expect(b.whiteLabeled).toBe(true);
    expect(b.productName).toBe("Agency Insights");
    expect(b.logoUrl).toBe("https://agency.example/logo.png");
    expect(b.footerText).toBe("Sent by Agency Insights");
  });

  it("applies for Pro too", () => {
    expect(effectiveBranding(profile({ plan: "pro" })).whiteLabeled).toBe(true);
  });

  it("falls back to Inteloop when not enabled", () => {
    expect(effectiveBranding(profile({ white_label_enabled: false }))).toEqual(DEFAULT_BRANDING);
  });

  it("falls back when the plan lacks the capability (Starter / trial)", () => {
    expect(effectiveBranding(profile({ plan: "starter" }))).toEqual(DEFAULT_BRANDING);
    expect(effectiveBranding(profile({ plan: "trial" }))).toEqual(DEFAULT_BRANDING);
  });

  it("disables immediately on downgrade to Starter even if still enabled (§13.4)", () => {
    const b = effectiveBranding(profile({ plan: "starter", white_label_enabled: true }));
    expect(b.whiteLabeled).toBe(false);
    expect(b.productName).toBe("Inteloop");
  });

  it("uses a neutral product name when sender name is blank", () => {
    const b = effectiveBranding(profile({ white_label_sender_name: null }));
    expect(b.whiteLabeled).toBe(true);
    expect(b.productName).not.toBe("Inteloop");
  });
});

describe("brandedFromAddress", () => {
  it("swaps the display name for white-label, keeping the address", () => {
    const b = effectiveBranding(profile({}));
    expect(brandedFromAddress("Inteloop <noreply@inteloop.com>", b)).toBe(
      "Agency Insights <noreply@inteloop.com>",
    );
  });

  it("returns the base address when not white-labeled", () => {
    expect(brandedFromAddress("Inteloop <noreply@inteloop.com>", DEFAULT_BRANDING)).toBe(
      "Inteloop <noreply@inteloop.com>",
    );
  });
});

describe("whiteLabelUpdateSchema (§13.2)", () => {
  it("accepts valid input and maps empty strings to null", () => {
    const parsed = whiteLabelUpdateSchema.parse({
      enabled: true,
      sender_name: "Agency Insights",
      logo_url: "",
      footer_text: "",
    });
    expect(parsed.logo_url).toBeNull();
    expect(parsed.footer_text).toBeNull();
  });

  it("rejects a too-short sender name and a bad logo URL", () => {
    expect(
      whiteLabelUpdateSchema.safeParse({
        enabled: true,
        sender_name: "A",
        logo_url: null,
        footer_text: null,
      }).success,
    ).toBe(false);
    expect(
      whiteLabelUpdateSchema.safeParse({
        enabled: true,
        sender_name: null,
        logo_url: "not-a-url",
        footer_text: null,
      }).success,
    ).toBe(false);
  });

  it("rejects footer text over 200 characters", () => {
    expect(
      whiteLabelUpdateSchema.safeParse({
        enabled: true,
        sender_name: null,
        logo_url: null,
        footer_text: "x".repeat(201),
      }).success,
    ).toBe(false);
  });
});
