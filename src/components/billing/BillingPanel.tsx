"use client";

import { useEffect, useState } from "react";

import type { BillingInterval, PaidPlan } from "@/lib/billing/plans";
import {
  interpretPaymentStatus,
  PAYMENT_POLL_TIMEOUT_MESSAGE,
  type PaymentInterpretation,
} from "@/lib/billing/mobileMoneyMessages";
import type { BillingView, CheckoutChannel, PlanCard } from "@/lib/billing/view";

type Props = {
  view: BillingView;
  plans: PlanCard[];
  initialChannel: CheckoutChannel;
};

type ActivePayment = { id: string; planName: string; initiateMessage: string };

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20; // ~60s (§21.4)

async function postJson(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, ...data };
}

const CHANNELS: { id: CheckoutChannel; label: string }[] = [
  { id: "card", label: "Card" },
  { id: "mpesa", label: "Mpesa" },
  { id: "kcb", label: "Lipa na KCB" },
];

export function BillingPanel({ view, plans, initialChannel }: Props) {
  const [channel, setChannel] = useState<CheckoutChannel>(initialChannel);
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [payment, setPayment] = useState<ActivePayment | null>(null);
  const [poll, setPoll] = useState<PaymentInterpretation | null>(null);

  // Poll the payment status once a mobile-money charge is initiated (§21.4).
  useEffect(() => {
    if (!payment) return;
    let cancelled = false;
    let attempts = 0;

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const res = await fetch(`/api/billing/payments/${payment.id}`);
        const body = (await res.json().catch(() => ({}))) as {
          data?: { status: string; result_code?: string | null };
        };
        if (res.ok && body.data) {
          const interp = interpretPaymentStatus(body.data);
          if (cancelled) return;
          setPoll(interp);
          if (interp.state === "success") {
            window.setTimeout(() => {
              window.location.href = "/dashboard?subscribed=1";
            }, 1500);
            return;
          }
          if (interp.state === "failed") return;
        }
      } catch {
        // network blip — keep polling until attempts run out
      }
      if (attempts >= POLL_MAX_ATTEMPTS) {
        if (!cancelled) setPoll({ state: "pending", message: PAYMENT_POLL_TIMEOUT_MESSAGE });
        return;
      }
      if (!cancelled) window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    window.setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
    };
  }, [payment]);

  async function subscribeCard(plan: PaidPlan) {
    setError(null);
    setPending(plan);
    const r = await postJson("/api/billing/create-checkout", { plan, interval });
    if (r.ok && typeof r.url === "string") {
      window.location.href = r.url;
      return;
    }
    setError((r.error as string) ?? "Could not start checkout.");
    setPending(null);
  }

  async function manage() {
    setError(null);
    setPending("portal");
    const r = await postJson("/api/billing/portal");
    if (r.ok && typeof r.url === "string") {
      window.location.href = r.url;
      return;
    }
    setError((r.error as string) ?? "Could not open the billing portal.");
    setPending(null);
  }

  async function payMobile(plan: PaidPlan, planName: string) {
    setError(null);
    if (channel === "mpesa" && !/^(?:\+?254|0)?(?:7|1)\d{8}$/.test(phone.trim())) {
      setError("Enter a valid Safaricom phone number.");
      return;
    }
    setPending(plan);
    const url = channel === "mpesa" ? "/api/billing/mpesa-initiate" : "/api/billing/kcb-initiate";
    const r = await postJson(url, channel === "mpesa" ? { plan, phone: phone.trim() } : { plan });
    setPending(null);
    if (r.ok && typeof r.paymentId === "string") {
      setPayment({
        id: r.paymentId,
        planName,
        initiateMessage: (r.message as string) ?? "Check your phone for the prompt.",
      });
      setPoll({ state: "pending", message: (r.message as string) ?? "Check your phone…" });
      return;
    }
    setError((r.error as string) ?? "Could not start the payment.");
  }

  function reset() {
    setPayment(null);
    setPoll(null);
    setError(null);
  }

  // ---- Manage (existing subscriber) ----
  if (view.mode === "manage") {
    return (
      <div className="space-y-4">
        <div className="card flex flex-col items-start gap-3">
          <p className="text-sm text-neutral-700">{view.statusLabel}</p>
          <button
            type="button"
            onClick={manage}
            disabled={pending === "portal"}
            className="btn-primary"
          >
            {pending === "portal" ? "Opening…" : "Manage subscription"}
          </button>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
      </div>
    );
  }

  // ---- In-flight mobile-money payment ----
  if (payment) {
    const state = poll?.state ?? "pending";
    return (
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-neutral-950">{payment.planName} — payment</h2>
        <div className="flex items-start gap-3">
          <span aria-hidden className="text-2xl">
            {state === "success" ? "✅" : state === "failed" ? "⚠️" : "⏳"}
          </span>
          <p className="text-sm text-neutral-700">{poll?.message ?? payment.initiateMessage}</p>
        </div>
        {state !== "success" ? (
          <button type="button" onClick={reset} className="btn-secondary">
            {state === "failed" ? "Try again" : "Start over"}
          </button>
        ) : null}
      </div>
    );
  }

  // ---- Subscribe (plan picker) ----
  const mobile = channel === "mpesa" || channel === "kcb";

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-700">{view.statusLabel}</p>

      {/* Channel switch (§10.4) */}
      <div className="flex flex-wrap items-center gap-1 rounded-full border border-neutral-200 bg-white p-1 text-sm sm:w-fit">
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setChannel(c.id)}
            className={
              channel === c.id
                ? "rounded-full bg-neutral-900 px-4 py-1.5 font-medium text-white"
                : "rounded-full px-4 py-1.5 font-medium text-neutral-600 hover:text-neutral-900"
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Interval toggle (card only — mobile money is monthly) */}
      {!mobile ? (
        <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white p-1 text-sm sm:w-fit">
          {(["monthly", "annual"] as BillingInterval[]).map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInterval(i)}
              className={
                interval === i
                  ? "rounded-full bg-neutral-900 px-4 py-1.5 font-medium text-white"
                  : "rounded-full px-4 py-1.5 font-medium text-neutral-600 hover:text-neutral-900"
              }
            >
              {i === "monthly" ? (
                "Monthly"
              ) : (
                <span className="flex items-center gap-1.5">
                  Annual
                  <span
                    className={
                      interval === "annual"
                        ? "rounded-full bg-emerald-500 px-1.5 py-0.5 text-xs font-medium text-white"
                        : "rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700"
                    }
                  >
                    2 months free
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}

      {channel === "mpesa" ? (
        <div className="sm:max-w-xs">
          <label htmlFor="mpesa_phone" className="field-label">
            Safaricom phone number
          </label>
          <input
            id="mpesa_phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07XX XXX XXX"
            className="field-input"
          />
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((p) => {
          const price = mobile ? p.kesMonthly : interval === "annual" ? p.annualMonthly : p.monthly;
          const showAnnualSubtext = !mobile && interval === "annual";
          const label =
            channel === "mpesa"
              ? "Pay with Mpesa"
              : channel === "kcb"
                ? "Pay with KCB"
                : `Choose ${p.name}`;
          return (
            <div key={p.id} className="card flex flex-col">
              <h3 className="text-lg font-semibold text-neutral-950">{p.name}</h3>
              <p className="mt-2">
                <span className="text-3xl font-semibold tracking-tight text-neutral-950">
                  {price}
                </span>
                <span className="text-sm text-neutral-500">/mo</span>
              </p>
              {showAnnualSubtext ? (
                <p className="mt-0.5 text-xs text-neutral-400">Billed {p.annual} annually</p>
              ) : null}
              <p className="mt-1 text-sm text-neutral-500">
                Track up to {p.competitorLimit} competitors
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm text-neutral-700">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-rose-500">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => (mobile ? payMobile(p.id, p.name) : subscribeCard(p.id))}
                disabled={pending === p.id}
                className="btn-primary mt-6 w-full"
              >
                {pending === p.id ? "Starting…" : label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
