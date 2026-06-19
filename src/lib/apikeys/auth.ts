import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { hasCapability } from "../billing/capabilities";
import { hashApiKey, parseBearerToken } from "./keys";
import { checkRateLimit } from "./rateLimit";

// Authenticates a public API request by its bearer API key (PRD §15.2/§15.4).
// Uses the service-role client; callers MUST scope every query to the returned
// userId (RLS is bypassed).

export type ApiAuthOk = { ok: true; userId: string; plan: string; keyId: string };
export type ApiAuthError = { ok: false; response: NextResponse };

function err(status: number, message: string, headers?: Record<string, string>): ApiAuthError {
  return { ok: false, response: NextResponse.json({ error: message }, { status, headers }) };
}

export async function authenticateApiRequest(
  request: Request,
  supabase: SupabaseClient,
): Promise<ApiAuthOk | ApiAuthError> {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return err(401, "Missing API key. Pass it as a Bearer token.");
  }

  // Look up by hash; the partial index only covers non-revoked keys, and we
  // filter revoked_at explicitly so a revoked key is 401 immediately (§15.4).
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, user_id, revoked_at")
    .eq("key_hash", hashApiKey(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (error) return err(500, "Authentication error.");
  const key = data as { id: string; user_id: string } | null;
  if (!key) return err(401, "Invalid or revoked API key.");

  // Plan gate (§15.4).
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", key.user_id)
    .maybeSingle();
  const plan = (profile as { plan: string } | null)?.plan ?? "trial";
  if (!hasCapability(plan, "apiAccess")) {
    return err(403, "API access is available on the Pro plan.");
  }

  // Rate limit (§15.2).
  const rate = await checkRateLimit(supabase, key.id);
  if (!rate.ok) {
    return err(429, "Too Many Requests", { "Retry-After": String(rate.retryAfter) });
  }

  // Best-effort last-used stamp; never block the request on it.
  void supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id);

  return { ok: true, userId: key.user_id, plan, keyId: key.id };
}
