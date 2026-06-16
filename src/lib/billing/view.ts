import { PAID_PLANS, PLANS, type BillingInterval, type PaidPlan } from "./plans";

// Presentation helpers for the billing dashboard (PRD §11.2, §10). Pure — no
// env or server-only imports — so they're unit-testable and safe to share with
// the client panel.

export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// Whole shillings — mobile money has no minor unit in this product.
export function formatKes(amount: number): string {
  return `KES ${amount.toLocaleString("en-US")}`;
}

export type CheckoutChannel = "card" | "mpesa" | "kcb";

// §10.4: KES users default to mobile money, everyone else to card. The UI lets
// users switch channels regardless.
export function defaultChannel(currency: string | null | undefined): CheckoutChannel {
  return currency === "KES" ? "mpesa" : "card";
}

// Short feature blurbs per plan (§10.2 features column).
const PLAN_FEATURES: Record<PaidPlan, string[]> = {
  starter: ["Weekly email report", "Slack alerts", "Report history"],
  growth: [
    "Everything in Starter",
    "White-label reports",
    "Custom sender domain",
    "Real-time alerts",
  ],
  pro: ["Everything in Growth", "Daily briefing", "Battlecard generation", "API access"],
};

export type PlanCard = {
  id: PaidPlan;
  name: string;
  monthly: string;
  annual: string;
  // KES monthly price for the mobile-money channel (mobile money is monthly-only).
  kesMonthly: string;
  competitorLimit: number;
  features: string[];
};

export function planCards(): PlanCard[] {
  return PAID_PLANS.map((id) => {
    const p = PLANS[id];
    return {
      id,
      name: p.name,
      monthly: formatUsd(p.usd.monthlyCents),
      annual: formatUsd(p.usd.annualCents),
      kesMonthly: formatKes(p.kes.monthly),
      competitorLimit: p.competitorLimit,
      features: PLAN_FEATURES[id],
    };
  });
}

export type BillingProfile = {
  plan: string;
  stripe_current_period_end: string | null;
  subscription_renewal_date: string | null;
};

export type BillingView = {
  // 'subscribe' → show plan picker; 'manage' → show Customer Portal button.
  mode: "subscribe" | "manage";
  statusLabel: string;
};

function periodEnd(p: BillingProfile): Date | null {
  const raw = p.stripe_current_period_end ?? p.subscription_renewal_date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Decide whether to show the plan picker or the manage-subscription view, with
// a human status line. (§10.10/§10.11 inform the cancelled-grace wording.)
export function billingViewState(p: BillingProfile, now: Date = new Date()): BillingView {
  if (p.plan in PLANS) {
    return { mode: "manage", statusLabel: `You're on the ${PLANS[p.plan as PaidPlan].name} plan.` };
  }
  if (p.plan === "payment_failed") {
    return {
      mode: "manage",
      statusLabel: "Your last payment failed — update your payment method to stay subscribed.",
    };
  }
  if (p.plan === "cancelled") {
    const end = periodEnd(p);
    if (end && now < end) {
      return {
        mode: "manage",
        statusLabel: `Cancelled — you have access until ${formatDate(end)}.`,
      };
    }
    return { mode: "subscribe", statusLabel: "Your subscription has ended. Resubscribe any time." };
  }
  // trial / unknown
  return {
    mode: "subscribe",
    statusLabel: "You're on a free trial. Pick a plan to keep your reports coming.",
  };
}

export const BILLING_INTERVALS: BillingInterval[] = ["monthly", "annual"];
