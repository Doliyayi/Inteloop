// User-facing mobile-money status mapping (PRD §21.4 / §10.11). Pure — shared
// by the checkout UI (via the status endpoint) and unit tests.

export type PaymentUiState = "pending" | "success" | "failed";

export type PaymentStatusInput = {
  status: string; // payments.status
  result_code?: string | null; // Daraja/KCB result code on failure
};

// Maps a failed Mpesa ResultCode to the exact copy from §21.4.
export function mpesaResultMessage(code: string | null | undefined): string {
  switch (code) {
    case "1032":
      return "Payment cancelled. Tap to try again.";
    case "1037":
      return "Your Mpesa session timed out. Tap to resend the prompt.";
    case "1":
      return "Insufficient Mpesa balance. Please top up and try again.";
    default:
      return "Payment failed. Tap to try again.";
  }
}

export type PaymentInterpretation = { state: PaymentUiState; message: string };

// Translate a payment row's status into a UI state + message.
export function interpretPaymentStatus(p: PaymentStatusInput): PaymentInterpretation {
  if (p.status === "success") {
    return { state: "success", message: "Payment confirmed! Activating your subscription…" };
  }
  if (p.status === "failed") {
    return { state: "failed", message: mpesaResultMessage(p.result_code) };
  }
  // pending / pending_confirmation
  return {
    state: "pending",
    message: "Check your phone for the prompt. It may take up to a minute to arrive.",
  };
}

// Shown when polling elapses without a final result (§21.4 60s threshold).
export const PAYMENT_POLL_TIMEOUT_MESSAGE =
  "Still waiting for confirmation. Check your phone, or tap to retry.";
