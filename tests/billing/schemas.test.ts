import { describe, expect, it } from "vitest";

import {
  checkoutRequestSchema,
  kcbInitiateSchema,
  mpesaInitiateSchema,
  parseKcbCallback,
  parseMpesaCallback,
} from "@/lib/billing/schemas";

describe("billing request schemas", () => {
  it("defaults checkout interval to monthly", () => {
    const parsed = checkoutRequestSchema.parse({ plan: "growth" });
    expect(parsed).toEqual({ plan: "growth", interval: "monthly" });
  });

  it("rejects an unknown plan", () => {
    expect(checkoutRequestSchema.safeParse({ plan: "enterprise" }).success).toBe(false);
  });

  it("accepts valid Safaricom phone formats for Mpesa", () => {
    for (const phone of ["0712345678", "254712345678", "+254712345678", "0112345678"]) {
      expect(mpesaInitiateSchema.safeParse({ plan: "starter", phone }).success).toBe(true);
    }
  });

  it("rejects a bad phone number", () => {
    expect(mpesaInitiateSchema.safeParse({ plan: "starter", phone: "12345" }).success).toBe(false);
  });

  it("forces monthly interval for mobile money", () => {
    expect(
      mpesaInitiateSchema.safeParse({ plan: "starter", phone: "0712345678", interval: "annual" })
        .success,
    ).toBe(false);
    expect(kcbInitiateSchema.safeParse({ plan: "pro", interval: "annual" }).success).toBe(false);
  });
});

describe("parseMpesaCallback (PRD §10.9)", () => {
  it("extracts success fields from a ResultCode 0 callback", () => {
    const payload = {
      Body: {
        stkCallback: {
          MerchantRequestID: "mr-1",
          CheckoutRequestID: "co-1",
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 25500 },
              { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" },
              { Name: "PhoneNumber", Value: 254712345678 },
            ],
          },
        },
      },
    };
    const parsed = parseMpesaCallback(payload);
    expect(parsed).toEqual({
      merchantRequestId: "mr-1",
      checkoutRequestId: "co-1",
      resultCode: 0,
      resultDesc: "The service request is processed successfully.",
      amount: 25500,
      receipt: "NLJ7RT61SV",
      phone: "254712345678",
    });
  });

  it("parses a failure callback with no metadata", () => {
    const parsed = parseMpesaCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: "mr-2",
          CheckoutRequestID: "co-2",
          ResultCode: 1032,
          ResultDesc: "Request cancelled by user",
        },
      },
    });
    expect(parsed?.resultCode).toBe(1032);
    expect(parsed?.receipt).toBeNull();
    expect(parsed?.amount).toBeNull();
  });

  it("returns null for a malformed payload", () => {
    expect(parseMpesaCallback({ foo: "bar" })).toBeNull();
    expect(parseMpesaCallback(null)).toBeNull();
  });
});

describe("parseKcbCallback (unverified shape)", () => {
  it("normalises a success callback", () => {
    const parsed = parseKcbCallback({
      transactionReference: "KCB-123",
      status: "SUCCESS",
      amount: 51400,
      accountReference: "INT-growth",
    });
    expect(parsed).toEqual({
      transactionReference: "KCB-123",
      resultCode: null,
      status: "SUCCESS",
      amount: 51400,
      accountReference: "INT-growth",
      description: null,
    });
  });

  it("returns null when the reference is missing", () => {
    expect(parseKcbCallback({ status: "SUCCESS" })).toBeNull();
  });
});
