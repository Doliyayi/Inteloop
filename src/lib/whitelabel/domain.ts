import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DnsRecord, DomainStatus, ResendDomainsClient } from "../integrations/resendDomains";

// Custom sender-domain registration + DNS verification (PRD §13.3). The caller
// passes a Supabase client scoped appropriately (session client for the
// dashboard routes; service-role for the cron).

export type DomainDeps = {
  supabase: SupabaseClient;
  resend: ResendDomainsClient;
};

export type DomainOutcome =
  | { ok: true; status: DomainStatus; verified: boolean; records: DnsRecord[]; domain: string }
  | { ok: false; status: number; error: string };

// Basic hostname check (e.g. reports.agency.com). Avoids round-tripping
// obviously invalid input to Resend.
export function isValidDomain(value: string): boolean {
  return /^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/i.test(value.trim());
}

type DomainProfile = {
  white_label_domain: string | null;
  white_label_domain_id: string | null;
  white_label_domain_verified: boolean;
};

// §13.3 steps 1–3: register the domain with Resend and store its id + records.
export async function registerDomain(
  deps: DomainDeps,
  userId: string,
  domain: string,
): Promise<DomainOutcome> {
  const name = domain.trim().toLowerCase();
  if (!isValidDomain(name)) {
    return { ok: false, status: 400, error: "Enter a valid domain, e.g. reports.youragency.com." };
  }

  const res = await deps.resend.createDomain(name);
  if (!res.ok) {
    return { ok: false, status: 502, error: `Could not register the domain (${res.reason}).` };
  }

  const { error } = await deps.supabase
    .from("profiles")
    .update({
      white_label_domain: name,
      white_label_domain_id: res.id,
      white_label_domain_verified: false,
      white_label_domain_added_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return { ok: false, status: 500, error: error.message };

  return { ok: true, status: res.status, verified: false, records: res.records, domain: name };
}

// §13.3 steps 5–6: re-check (or trigger) verification; flip the verified flag
// when Resend reports the domain as verified.
export async function refreshDomainStatus(
  deps: DomainDeps,
  userId: string,
  opts: { triggerVerify?: boolean } = {},
): Promise<DomainOutcome> {
  const { data } = await deps.supabase
    .from("profiles")
    .select("white_label_domain, white_label_domain_id, white_label_domain_verified")
    .eq("id", userId)
    .maybeSingle();
  const profile = data as DomainProfile | null;
  if (!profile?.white_label_domain_id || !profile.white_label_domain) {
    return { ok: false, status: 404, error: "No domain registered." };
  }

  const res = opts.triggerVerify
    ? await deps.resend.verifyDomain(profile.white_label_domain_id)
    : await deps.resend.getDomain(profile.white_label_domain_id);
  if (!res.ok) {
    return { ok: false, status: 502, error: `Could not check verification (${res.reason}).` };
  }

  const verified = res.status === "verified";
  if (verified !== profile.white_label_domain_verified) {
    await deps.supabase
      .from("profiles")
      .update({ white_label_domain_verified: verified })
      .eq("id", userId);
  }

  return {
    ok: true,
    status: res.status,
    verified,
    records: res.records,
    domain: profile.white_label_domain,
  };
}

// Remove the custom domain (reverts to display-name-only white-label).
export async function removeDomain(deps: DomainDeps, userId: string): Promise<{ ok: boolean }> {
  const { error } = await deps.supabase
    .from("profiles")
    .update({
      white_label_domain: null,
      white_label_domain_id: null,
      white_label_domain_verified: false,
      white_label_domain_added_at: null,
    })
    .eq("id", userId);
  return { ok: !error };
}

// §13.3 step 5: unverified domains registered within the last `hours` (default
// 24h). The cron stops polling after the window.
export async function findUsersPendingDomainVerification(
  supabase: SupabaseClient,
  hours = 24,
  limit = 500,
): Promise<string[]> {
  const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .not("white_label_domain_id", "is", null)
    .eq("white_label_domain_verified", false)
    .gte("white_label_domain_added_at", cutoff)
    .limit(limit);
  if (error || !data) return [];
  return (data as Array<{ id: string }>).map((r) => r.id);
}
