import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createResendDomainsClient } from "../integrations/resendDomains";
import { createSupabaseAdminClient } from "../supabase/admin";
import type { DomainDeps } from "./domain";

function resendApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set.");
  return key;
}

// Routes pass their RLS-scoped session client; the cron uses the admin client.
export function domainDeps(supabase: SupabaseClient): DomainDeps {
  return { supabase, resend: createResendDomainsClient({ apiKey: resendApiKey() }) };
}

export function adminDomainDeps(): DomainDeps {
  return {
    supabase: createSupabaseAdminClient(),
    resend: createResendDomainsClient({ apiKey: resendApiKey() }),
  };
}
