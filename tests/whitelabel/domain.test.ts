import { describe, expect, it } from "vitest";

import { isValidDomain } from "@/lib/whitelabel/domain";

describe("isValidDomain (PRD §13.3)", () => {
  it("accepts real hostnames", () => {
    expect(isValidDomain("reports.youragency.com")).toBe(true);
    expect(isValidDomain("agency.com")).toBe(true);
    expect(isValidDomain("a.b.c.io")).toBe(true);
  });
  it("rejects junk", () => {
    expect(isValidDomain("nope")).toBe(false);
    expect(isValidDomain("http://x.com")).toBe(false);
    expect(isValidDomain("x.com/path")).toBe(false);
    expect(isValidDomain("")).toBe(false);
    expect(isValidDomain("spaces here.com")).toBe(false);
  });
});
