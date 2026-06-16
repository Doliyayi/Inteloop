"use client";

import { useState } from "react";

import type { BillingInterval, PaidPlan } from "@/lib/billing/plans";
import type { BillingView, PlanCard } from "@/lib/billing/view";

type Props = {
  view: BillingView;
  plans: PlanCard[];
};

async function postJson(url: string, body?: unknown): Promise<{ url?: string; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) return { error: data.error ?? "Something went wrong." };
  return data;
}

export function BillingPanel({ view, plans }: Props) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [pending, setPending] = useState<string | null>(null); // plan id or "portal"
  const [error, setError] = useState<string | null>(null);

  async function subscribe(plan: PaidPlan) {
    setError(null);
    setPending(plan);
    const { url, error } = await postJson("/api/billing/create-checkout", { plan, interval });
    if (url) {
      window.location.href = url;
      return;
    }
    setError(error ?? "Could not start checkout.");
    setPending(null);
  }

  async function manage() {
    setError(null);
    setPending("portal");
    const { url, error } = await postJson("/api/billing/portal");
    if (url) {
      window.location.href = url;
      return;
    }
    setError(error ?? "Could not open the billing portal.");
    setPending(null);
  }

  return (
    <div className="space-y-6">
      <div className="card flex flex-col items-start gap-3">
        <p className="text-sm text-neutral-700">{view.statusLabel}</p>
        {view.mode === "manage" ? (
          <button
            type="button"
            onClick={manage}
            disabled={pending === "portal"}
            className="btn-primary"
          >
            {pending === "portal" ? "Opening…" : "Manage subscription"}
          </button>
        ) : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {view.mode === "subscribe" ? (
        <>
          <div className="flex items-center justify-center gap-1 rounded-full border border-neutral-200 bg-white p-1 text-sm sm:w-fit">
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
                {i === "monthly" ? "Monthly" : "Annual"}
              </button>
            ))}
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {plans.map((p) => (
              <div key={p.id} className="card flex flex-col">
                <h3 className="text-lg font-semibold text-neutral-950">{p.name}</h3>
                <p className="mt-2">
                  <span className="text-3xl font-semibold tracking-tight text-neutral-950">
                    {interval === "monthly" ? p.monthly : p.annual}
                  </span>
                  <span className="text-sm text-neutral-500">
                    /{interval === "monthly" ? "mo" : "yr"}
                  </span>
                </p>
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
                  onClick={() => subscribe(p.id)}
                  disabled={pending === p.id}
                  className="btn-primary mt-6 w-full"
                >
                  {pending === p.id ? "Starting…" : `Choose ${p.name}`}
                </button>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
