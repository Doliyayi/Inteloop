import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// Fixed-window rate limit (PRD §15.2: 100 req/min per key) backed by the
// api_rate_limits table + increment_api_rate_limit() RPC.

export const RATE_LIMIT_PER_MINUTE = 100;
const WINDOW_MS = 60_000;

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

function windowStart(now: number): Date {
  return new Date(Math.floor(now / WINDOW_MS) * WINDOW_MS);
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  keyId: string,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const start = windowStart(now);
  const { data, error } = await supabase.rpc("increment_api_rate_limit", {
    p_key_id: keyId,
    p_window_start: start.toISOString(),
  });
  // Fail open on counter errors — never let a limiter glitch take down the API.
  if (error || typeof data !== "number") return { ok: true };

  if (data > RATE_LIMIT_PER_MINUTE) {
    const retryAfter = Math.max(1, Math.ceil((start.getTime() + WINDOW_MS - now) / 1000));
    return { ok: false, retryAfter };
  }
  return { ok: true };
}
