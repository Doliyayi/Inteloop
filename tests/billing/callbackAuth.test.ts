import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

import { parseIpList, verifyCallbackAuth } from "@/lib/billing/callbackAuth";

// verifyCallbackAuth only reads request.url and request.headers, so a plain
// Request satisfies its contract.
function req(url: string, headers: Record<string, string> = {}): NextRequest {
  return new Request(url, { headers }) as unknown as NextRequest;
}

describe("verifyCallbackAuth (PRD §10.9)", () => {
  it("accepts a matching shared-secret token", () => {
    const r = req("https://app.inteloop.com/api/webhooks/mpesa?token=s3cret");
    expect(verifyCallbackAuth(r, { secret: "s3cret" })).toBe(true);
  });

  it("rejects a wrong or missing token", () => {
    expect(
      verifyCallbackAuth(req("https://app.inteloop.com/cb?token=nope"), { secret: "s3cret" }),
    ).toBe(false);
    expect(verifyCallbackAuth(req("https://app.inteloop.com/cb"), { secret: "s3cret" })).toBe(
      false,
    );
  });

  it("accepts a request from an allowlisted IP", () => {
    const r = req("https://app.inteloop.com/cb", {
      "x-forwarded-for": "196.201.214.200, 10.0.0.1",
    });
    expect(verifyCallbackAuth(r, { allowedIps: ["196.201.214.200"] })).toBe(true);
  });

  it("rejects a non-allowlisted IP", () => {
    const r = req("https://app.inteloop.com/cb", { "x-forwarded-for": "1.2.3.4" });
    expect(verifyCallbackAuth(r, { allowedIps: ["196.201.214.200"] })).toBe(false);
  });

  it("passes when either secret or IP matches", () => {
    const r = req("https://app.inteloop.com/cb?token=s3cret", { "x-forwarded-for": "1.2.3.4" });
    expect(verifyCallbackAuth(r, { secret: "s3cret", allowedIps: ["9.9.9.9"] })).toBe(true);
  });

  it("fails closed when nothing is configured", () => {
    expect(verifyCallbackAuth(req("https://app.inteloop.com/cb"), {})).toBe(false);
  });
});

describe("parseIpList", () => {
  it("splits, trims, and drops empties", () => {
    expect(parseIpList(" 1.1.1.1, 2.2.2.2 ,, 3.3.3.3 ")).toEqual(["1.1.1.1", "2.2.2.2", "3.3.3.3"]);
    expect(parseIpList(undefined)).toEqual([]);
  });
});
