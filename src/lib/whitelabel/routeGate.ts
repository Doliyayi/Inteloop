import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requirePlanCapability } from "../billing/capabilities";

// Shared white-label gate for the domain routes: confirms the signed-in user
// has the whiteLabel capability (Growth/Pro). Returns the userId on success.
export type WhiteLabelGate =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

export async function gateWhiteLabel(supabase: SupabaseClient): Promise<WhiteLabelGate> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data } = await supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle();
  const cap = requirePlanCapability((data as { plan: string } | null)?.plan, "whiteLabel");
  if (!cap.ok) return { ok: false, status: cap.status, error: cap.error };
  return { ok: true, userId: user.id };
}
