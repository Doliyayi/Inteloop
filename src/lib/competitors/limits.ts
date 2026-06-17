import { capabilitiesFor } from "@/lib/billing/capabilities";

// Plan limits per PRD §7.3. Derived from the central capability model so there
// is a single source of truth for the numbers.
export const PLAN_COMPETITOR_LIMITS: Record<string, number> = {
  trial: capabilitiesFor("trial").competitorLimit,
  starter: capabilitiesFor("starter").competitorLimit,
  growth: capabilitiesFor("growth").competitorLimit,
  pro: capabilitiesFor("pro").competitorLimit,
  cancelled: capabilitiesFor("cancelled").competitorLimit,
  payment_failed: capabilitiesFor("payment_failed").competitorLimit,
};

// PRD §7.4 prescribes the Starter upgrade copy verbatim:
//   "Your plan includes up to 3 competitors. Upgrade to Growth to track up to 8."
// We extend the same pattern to Growth (→ Pro) and produce sensible copy for
// other plan states.
export function planLimitMessage(plan: string, limit: number): string {
  switch (plan) {
    case "trial":
    case "starter":
      return `Your plan includes up to ${limit} competitors. Upgrade to Growth to track up to 8.`;
    case "growth":
      return `Your plan includes up to ${limit} competitors. Upgrade to Pro to track up to 15.`;
    case "pro":
      return `Your Pro plan includes up to ${limit} competitors.`;
    case "cancelled":
    case "payment_failed":
      return "Your plan is not active. Reactivate to add competitors.";
    default:
      return "Your plan does not include competitor tracking.";
  }
}

export function competitorLimitFor(plan: string | null | undefined): number {
  return capabilitiesFor(plan).competitorLimit;
}

import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanGateResult =
  | { ok: true; plan: string; limit: number; current: number }
  | { ok: false; status: number; error: string };

// Server-side gate used by POST /api/competitors before insert. Returns a
// non-ok result with the PRD §7.4 copy when the user is at or above their
// plan limit.
export async function checkCanAddCompetitor(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlanGateResult> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return { ok: false, status: 500, error: "Could not load profile." };
  }

  const plan = (profile as { plan: string }).plan;
  const limit = competitorLimitFor(plan);

  if (limit === 0) {
    return { ok: false, status: 422, error: planLimitMessage(plan, limit) };
  }

  const { count, error: countError } = await supabase
    .from("competitors")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (countError) {
    return { ok: false, status: 500, error: "Could not check plan limit." };
  }

  const current = count ?? 0;
  if (current >= limit) {
    return { ok: false, status: 422, error: planLimitMessage(plan, limit) };
  }

  return { ok: true, plan, limit, current };
}
