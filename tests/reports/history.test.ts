import { describe, expect, it } from "vitest";

import { clampPage, clampPageSize, DEFAULT_PAGE_SIZE } from "@/lib/reports/history";

describe("report history pagination guards (PRD §11)", () => {
  it("clampPage floors to a positive integer, defaulting to 1", () => {
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-3)).toBe(1);
    expect(clampPage(2.7)).toBe(2);
    expect(clampPage(Number.NaN)).toBe(1);
  });

  it("clampPageSize defaults and caps within [1, 50]", () => {
    expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(10)).toBe(10);
    expect(clampPageSize(999)).toBe(50);
    expect(clampPageSize(-5)).toBe(DEFAULT_PAGE_SIZE);
  });
});
