import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DarajaClient } from "../integrations/daraja";
import type { KcbClient } from "../integrations/kcb";
import type { ResendClient } from "../integrations/resend";
import { paymentConfirmedSubject, renderPaymentConfirmedHtml } from "./billingEmail";
import { getPlan, mobileMoneyAmount, type PaidPlan } from "./plans";
import type { ParsedKcbCallback, ParsedMpesaCallback } from "./schemas";

// Mobile money (Mpesa / KCB) initiation + callback reconciliation.
// Source: docs/inteloop-prd.md §10.6, §10.7, §10.9, §21.4.
//
// Mobile money has no provider-side subscription. Each charge is a row in
// `payments`; the provider's async callback flips it to success/failed and,
// on success, activates the subscription on `profiles`.

export type MobileMoneyDeps = {
  supabase: SupabaseClient; // service role
  daraja: DarajaClient;
  kcb: KcbClient;
  resend: ResendClient;
  fromAddress: string;
  mpesaCallbackUrl: string;
  kcbCallbackUrl: string;
};

export type InitiateResult =
  | { ok: true; paymentId: string; reference: string; customerMessage?: string }
  | { ok: false; error: string };

export type CallbackResult = {
  ok: boolean;
  status: "activated" | "failed" | "duplicate" | "unmatched" | "already_final";
  detail?: string;
};

function accountReference(plan: PaidPlan): string {
  // Daraja caps AccountReference at 12 chars. "INT-<plan>" stays under that.
  return `INT-${plan}`.slice(0, 12);
}

// Mobile money access runs for one month; the n8n renewal cron (§10.6) charges
// again before this date.
function oneMonthFrom(now: Date): string {
  const d = new Date(now);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10); // DATE column
}

// Flip the profile to an active paid subscription and email confirmation.
// Shared by both Mpesa and KCB success paths.
async function activateSubscription(
  deps: MobileMoneyDeps,
  opts: {
    userId: string;
    plan: PaidPlan;
    provider: "mpesa" | "kcb";
    amount: number;
    reference: string;
    phone?: string | null;
  },
): Promise<void> {
  await deps.supabase
    .from("profiles")
    .update({
      plan: opts.plan,
      currency: "KES",
      payment_method: opts.provider,
      subscribed_at: new Date().toISOString(),
      subscription_renewal_date: oneMonthFrom(new Date()),
      last_payment_reference: opts.reference,
      ...(opts.phone ? { mpesa_phone: opts.phone } : {}),
    })
    .eq("id", opts.userId);

  const { data: profile } = await deps.supabase
    .from("profiles")
    .select("email")
    .eq("id", opts.userId)
    .maybeSingle();
  const email = (profile as { email: string } | null)?.email;
  if (email) {
    await deps.resend.send({
      from: deps.fromAddress,
      to: email,
      subject: paymentConfirmedSubject(getPlan(opts.plan).name),
      html: renderPaymentConfirmedHtml({
        planName: getPlan(opts.plan).name,
        amountLabel: `KES ${opts.amount.toLocaleString("en-KE")}`,
      }),
    });
  }
}

// =========================================================
// Initiation
// =========================================================

export async function initiateMpesa(
  userId: string,
  req: { plan: PaidPlan; interval: "monthly"; phone: string },
  deps: MobileMoneyDeps,
): Promise<InitiateResult> {
  const amount = mobileMoneyAmount(req.plan, req.interval);
  if (amount === null) return { ok: false, error: "Mobile money supports monthly billing only." };

  const push = await deps.daraja.stkPush({
    amount,
    phone: req.phone,
    accountReference: accountReference(req.plan),
    transactionDesc: `Inteloop ${getPlan(req.plan).name} subscription`,
    callbackUrl: deps.mpesaCallbackUrl,
  });
  if (!push.ok) {
    // §21.4: surface a friendly, non-activating error. Detailed mapping of
    // result codes happens on the callback; here we only know the push failed.
    return { ok: false, error: `Mpesa request failed (${push.reason}).` };
  }

  const { data, error } = await deps.supabase
    .from("payments")
    .insert({
      user_id: userId,
      provider: "mpesa",
      plan: req.plan,
      billing_interval: req.interval,
      amount,
      currency: "KES",
      status: "pending",
      checkout_request_id: push.checkoutRequestId,
      merchant_request_id: push.merchantRequestId,
      phone: req.phone,
      account_reference: accountReference(req.plan),
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: `Failed to record payment: ${error?.message ?? "unknown"}` };
  }

  return {
    ok: true,
    paymentId: (data as { id: string }).id,
    reference: push.checkoutRequestId,
    customerMessage: push.customerMessage,
  };
}

export async function initiateKcb(
  userId: string,
  req: { plan: PaidPlan; interval: "monthly" },
  deps: MobileMoneyDeps,
): Promise<InitiateResult> {
  const amount = mobileMoneyAmount(req.plan, req.interval);
  if (amount === null) return { ok: false, error: "Mobile money supports monthly billing only." };

  const ref = accountReference(req.plan);
  const init = await deps.kcb.initiatePayment({
    amount,
    accountReference: ref,
    callbackUrl: deps.kcbCallbackUrl,
    description: `Inteloop ${getPlan(req.plan).name} subscription`,
  });
  if (!init.ok) {
    return { ok: false, error: `KCB request failed (${init.reason}).` };
  }

  const { data, error } = await deps.supabase
    .from("payments")
    .insert({
      user_id: userId,
      provider: "kcb",
      plan: req.plan,
      billing_interval: req.interval,
      amount,
      currency: "KES",
      status: "pending",
      // KCB's correlation id is echoed on the callback; store it for lookup.
      checkout_request_id: init.transactionReference,
      account_reference: ref,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: `Failed to record payment: ${error?.message ?? "unknown"}` };
  }

  return {
    ok: true,
    paymentId: (data as { id: string }).id,
    reference: init.transactionReference,
  };
}

// =========================================================
// Callback reconciliation
// =========================================================

type PaymentRow = {
  id: string;
  user_id: string;
  plan: PaidPlan;
  amount: number;
  status: string;
  provider_reference: string | null;
};

const PAYMENT_COLUMNS = "id, user_id, plan, amount, status, provider_reference";

export async function processMpesaCallback(
  cb: ParsedMpesaCallback,
  deps: MobileMoneyDeps,
): Promise<CallbackResult> {
  // §21.4: ignore a duplicate receipt without double-crediting.
  if (cb.receipt) {
    const { data: dupe } = await deps.supabase
      .from("payments")
      .select("id")
      .eq("provider", "mpesa")
      .eq("provider_reference", cb.receipt)
      .maybeSingle();
    if (dupe) return { ok: true, status: "duplicate", detail: cb.receipt };
  }

  const { data } = await deps.supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .eq("checkout_request_id", cb.checkoutRequestId)
    .maybeSingle();
  const payment = data as PaymentRow | null;
  if (!payment) return { ok: true, status: "unmatched", detail: cb.checkoutRequestId };

  // Idempotency: a payment already resolved is not reprocessed.
  if (payment.status === "success" || payment.status === "failed") {
    return { ok: true, status: "already_final", detail: payment.status };
  }

  if (cb.resultCode !== 0) {
    await deps.supabase
      .from("payments")
      .update({
        status: "failed",
        result_code: String(cb.resultCode),
        result_desc: cb.resultDesc,
      })
      .eq("id", payment.id);
    return { ok: true, status: "failed", detail: `ResultCode ${cb.resultCode}: ${cb.resultDesc}` };
  }

  await deps.supabase
    .from("payments")
    .update({
      status: "success",
      provider_reference: cb.receipt,
      result_code: "0",
      result_desc: cb.resultDesc,
      ...(cb.phone ? { phone: String(cb.phone) } : {}),
    })
    .eq("id", payment.id);

  await activateSubscription(deps, {
    userId: payment.user_id,
    plan: payment.plan,
    provider: "mpesa",
    amount: payment.amount,
    reference: cb.receipt ?? cb.checkoutRequestId,
    phone: cb.phone ? String(cb.phone) : null,
  });
  return { ok: true, status: "activated", detail: cb.receipt ?? undefined };
}

function kcbSucceeded(cb: ParsedKcbCallback): boolean {
  if (cb.status && cb.status.toUpperCase() === "SUCCESS") return true;
  return cb.resultCode === "0" || cb.resultCode === "00";
}

export async function processKcbCallback(
  cb: ParsedKcbCallback,
  deps: MobileMoneyDeps,
): Promise<CallbackResult> {
  // Dedupe on the settlement reference.
  const { data: dupe } = await deps.supabase
    .from("payments")
    .select("id")
    .eq("provider", "kcb")
    .eq("provider_reference", cb.transactionReference)
    .maybeSingle();
  if (dupe) return { ok: true, status: "duplicate", detail: cb.transactionReference };

  const { data } = await deps.supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .eq("checkout_request_id", cb.transactionReference)
    .maybeSingle();
  const payment = data as PaymentRow | null;
  if (!payment) return { ok: true, status: "unmatched", detail: cb.transactionReference };

  if (payment.status === "success" || payment.status === "failed") {
    return { ok: true, status: "already_final", detail: payment.status };
  }

  if (!kcbSucceeded(cb)) {
    await deps.supabase
      .from("payments")
      .update({
        status: "failed",
        result_code: cb.resultCode,
        result_desc: cb.status ?? cb.description,
      })
      .eq("id", payment.id);
    return { ok: true, status: "failed", detail: cb.resultCode ?? cb.status ?? "unknown" };
  }

  await deps.supabase
    .from("payments")
    .update({
      status: "success",
      provider_reference: cb.transactionReference,
      result_code: cb.resultCode ?? "0",
    })
    .eq("id", payment.id);

  await activateSubscription(deps, {
    userId: payment.user_id,
    plan: payment.plan,
    provider: "kcb",
    amount: payment.amount,
    reference: cb.transactionReference,
  });
  return { ok: true, status: "activated", detail: cb.transactionReference };
}
