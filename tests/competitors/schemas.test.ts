import { describe, it, expect } from "vitest";

import {
  competitorCreateSchema,
  competitorNameSchema,
  competitorNotesSchema,
  competitorUpdateSchema,
  websiteUrlSchema,
} from "@/lib/competitors/schemas";

describe("websiteUrlSchema", () => {
  it("accepts an https URL", () => {
    expect(websiteUrlSchema.safeParse("https://stripe.com").success).toBe(true);
  });

  it("rejects an http URL with the PRD §7.4 message", () => {
    const result = websiteUrlSchema.safeParse("http://stripe.com");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toBe("Please enter a valid URL including https://");
    }
  });

  it("rejects a non-URL string with the same message", () => {
    const result = websiteUrlSchema.safeParse("stripe");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toBe("Please enter a valid URL including https://");
    }
  });
});

describe("competitorNameSchema", () => {
  it("requires 2-100 chars", () => {
    expect(competitorNameSchema.safeParse("a").success).toBe(false);
    expect(competitorNameSchema.safeParse("ab").success).toBe(true);
    expect(competitorNameSchema.safeParse("a".repeat(100)).success).toBe(true);
    expect(competitorNameSchema.safeParse("a".repeat(101)).success).toBe(false);
  });

  it("trims whitespace", () => {
    const result = competitorNameSchema.safeParse("  Stripe  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("Stripe");
  });
});

describe("competitorNotesSchema", () => {
  it("allows null/undefined", () => {
    expect(competitorNotesSchema.safeParse(null).success).toBe(true);
    expect(competitorNotesSchema.safeParse(undefined).success).toBe(true);
  });

  it("rejects strings over 500 chars", () => {
    expect(competitorNotesSchema.safeParse("a".repeat(501)).success).toBe(false);
    expect(competitorNotesSchema.safeParse("a".repeat(500)).success).toBe(true);
  });

  it("coerces empty string to null", () => {
    const result = competitorNotesSchema.safeParse("");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });
});

describe("competitorCreateSchema", () => {
  it("requires name and website_url", () => {
    expect(competitorCreateSchema.safeParse({}).success).toBe(false);
    expect(competitorCreateSchema.safeParse({ name: "Stripe" }).success).toBe(false);
    expect(competitorCreateSchema.safeParse({ website_url: "https://stripe.com" }).success).toBe(
      false,
    );
  });

  it("accepts a valid create payload", () => {
    expect(
      competitorCreateSchema.safeParse({
        name: "Stripe",
        website_url: "https://stripe.com",
        notes: "Payment infrastructure",
      }).success,
    ).toBe(true);
  });
});

describe("competitorUpdateSchema", () => {
  it("rejects an empty update", () => {
    expect(competitorUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a partial update", () => {
    expect(competitorUpdateSchema.safeParse({ name: "Ack" }).success).toBe(true);
    expect(competitorUpdateSchema.safeParse({ website_url: "https://x.com" }).success).toBe(true);
  });
});
