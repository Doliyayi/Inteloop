import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// Read-side helpers for battlecard history (PRD §14.3). The caller passes an
// RLS-scoped client, so ownership is enforced by Postgres.

export type BattlecardListItem = {
  id: string;
  competitor_id: string;
  generated_at: string;
  competitor: { name: string } | null;
};

export type BattlecardDetail = {
  id: string;
  competitor_id: string;
  generated_at: string;
  content: unknown;
  competitor: { name: string } | null;
};

export async function listBattlecards(supabase: SupabaseClient): Promise<BattlecardListItem[]> {
  const { data, error } = await supabase
    .from("battlecards")
    .select("id, competitor_id, generated_at, competitor:competitors(name)")
    .order("generated_at", { ascending: false });
  if (error) throw new Error(`listBattlecards failed: ${error.message}`);
  return (data ?? []) as unknown as BattlecardListItem[];
}

export async function getBattlecard(
  supabase: SupabaseClient,
  id: string,
): Promise<BattlecardDetail | null> {
  const { data, error } = await supabase
    .from("battlecards")
    .select("id, competitor_id, generated_at, content, competitor:competitors(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getBattlecard failed: ${error.message}`);
  return (data as unknown as BattlecardDetail | null) ?? null;
}
