import { describe, expect, it } from "vitest";

import { interpretPaymentStatus, mpesaResultMessage } from "@/lib/billing/mobileMoneyMessages";
import { defaultChannel, formatKes } from "@/lib/billing/view";

describe("mpesaResultMessage (PRD §21.4)", () => {
  it("maps known Mpesa result codes to the spec copy", () => {
    expect(mpesaResultMessage("1032")).toBe("Payment cancelled. Tap to try again.");
    expect(mpesaResultMessage("1037")).toBe(
      "Your Mpesa session timed out. Tap to resend the prompt.",
    );
    expect(mpesaResultMessage("1")).toBe(
      "Insufficient Mpesa balance. Please top up and try again.",
    );
  });

  it("falls back for unknown / missing codes", () => {
    expect(mpesaResultMessage("999")).toBe("Payment failed. Tap to try again.");
    expect(mpesaResultMessage(null)).toBe("Payment failed. Tap to try again.");
  });
});

describe("interpretPaymentStatus", () => {
  it("success", () => {
    expect(interpretPaymentStatus({ status: "success" }).state).toBe("success");
  });
  it("failed surfaces the mapped result message", () => {
    const r = interpretPaymentStatus({ status: "failed", result_code: "1032" });
    expect(r.state).toBe("failed");
    expect(r.message).toBe("Payment cancelled. Tap to try again.");
  });
  it("pending / pending_confirmation stay pending", () => {
    expect(interpretPaymentStatus({ status: "pending" }).state).toBe("pending");
    expect(interpretPaymentStatus({ status: "pending_confirmation" }).state).toBe("pending");
  });
});

describe("checkout channel + KES formatting (PRD §10.4)", () => {
  it("KES users default to mpesa, others to card", () => {
    expect(defaultChannel("KES")).toBe("mpesa");
    expect(defaultChannel("USD")).toBe("card");
    expect(defaultChannel(null)).toBe("card");
  });
  it("formats whole shillings", () => {
    expect(formatKes(25_500)).toBe("KES 25,500");
    expect(formatKes(103_100)).toBe("KES 103,100");
  });
});
