import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "../supabase/admin";
import { authenticateApiRequest } from "./auth";

// Shared entry for public /v1 routes: authenticate the API key and hand back a
// service-role client + the resolved user. Callers MUST scope queries to userId.
export type ApiContext =
  | { ok: true; supabase: SupabaseClient; userId: string; plan: string }
  | { ok: false; response: Response };

export async function apiContext(request: Request): Promise<ApiContext> {
  const supabase = createSupabaseAdminClient();
  const auth = await authenticateApiRequest(request, supabase);
  if (!auth.ok) return auth;
  return { ok: true, supabase, userId: auth.userId, plan: auth.plan };
}

// §15.4 pagination envelope.
export function paginated<T>(items: T[], page: number, perPage: number, total: number) {
  return {
    data: items,
    total,
    page,
    per_page: perPage,
    next_page: page * perPage < total ? page + 1 : null,
  };
}
