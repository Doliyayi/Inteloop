import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { generateApiKey } from "./keys";

// API key lifecycle (PRD §15.3). Up to 5 active keys per account; plaintext is
// returned only at creation.

export const MAX_ACTIVE_KEYS = 5;

export type ApiKeyRow = {
  id: string;
  key_prefix: string;
  label: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

const LIST_COLUMNS = "id, key_prefix, label, last_used_at, created_at, revoked_at";

export type CreateApiKeyResult =
  | { ok: true; plaintext: string; key: ApiKeyRow }
  | { ok: false; status: number; error: string };

export async function listApiKeys(supabase: SupabaseClient, userId: string): Promise<ApiKeyRow[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select(LIST_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listApiKeys failed: ${error.message}`);
  return (data ?? []) as ApiKeyRow[];
}

export async function createApiKey(
  supabase: SupabaseClient,
  userId: string,
  label: string | null,
): Promise<CreateApiKeyResult> {
  // §15.3: cap active keys at 5.
  const { count, error: countError } = await supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (countError) return { ok: false, status: 500, error: "Could not check existing keys." };
  if ((count ?? 0) >= MAX_ACTIVE_KEYS) {
    return {
      ok: false,
      status: 422,
      error: `You can have at most ${MAX_ACTIVE_KEYS} active API keys. Revoke one first.`,
    };
  }

  const generated = generateApiKey();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: userId,
      key_hash: generated.hash,
      key_prefix: generated.prefix,
      label,
    })
    .select(LIST_COLUMNS)
    .single();
  if (error || !data) {
    return { ok: false, status: 500, error: "Could not create the API key." };
  }
  // The plaintext is returned here ONCE and never stored.
  return { ok: true, plaintext: generated.plaintext, key: data as ApiKeyRow };
}

export async function revokeApiKey(
  supabase: SupabaseClient,
  userId: string,
  keyId: string,
): Promise<{ ok: boolean }> {
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("user_id", userId)
    .is("revoked_at", null);
  return { ok: !error };
}
