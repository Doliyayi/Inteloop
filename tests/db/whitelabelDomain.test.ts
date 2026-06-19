import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import type { DomainStatus, ResendDomainsClient } from "@/lib/integrations/resendDomains";
import {
  findUsersPendingDomainVerification,
  refreshDomainStatus,
  registerDomain,
  type DomainDeps,
} from "@/lib/whitelabel/domain";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SERVICE) throw new Error("Run pnpm db:start first.");

const admin: SupabaseClient = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const createdUserIds: string[] = [];

function mockResend(status: DomainStatus): ResendDomainsClient {
  const make = (id: string) => ({
    ok: true as const,
    id,
    name: "reports.agency.com",
    status,
    records: [{ record: "SPF", type: "TXT", name: "send", value: "v=spf1" }],
  });
  return {
    createDomain: async () => make("dom_123"),
    getDomain: async (id) => make(id),
    verifyDomain: async (id) => make(id),
  };
}

function deps(status: DomainStatus = "pending"): DomainDeps {
  return { supabase: admin, resend: mockResend(status) };
}

async function makeUser(plan = "growth"): Promise<string> {
  const email = `wld-${randomUUID()}@inteloop.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "Wld-1!",
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("user not created");
  createdUserIds.push(data.user.id);
  await admin.from("profiles").update({ plan }).eq("id", data.user.id);
  return data.user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

describe("white-label domain workflow (PRD §13.3)", () => {
  it("registerDomain stores the domain id + records and leaves it unverified", async () => {
    const userId = await makeUser();
    const result = await registerDomain(deps(), userId, "Reports.Agency.com");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.domain).toBe("reports.agency.com"); // lowercased
    expect(result.records.length).toBeGreaterThan(0);

    const { data } = await admin
      .from("profiles")
      .select("white_label_domain, white_label_domain_id, white_label_domain_verified")
      .eq("id", userId)
      .single();
    expect(data!.white_label_domain).toBe("reports.agency.com");
    expect(data!.white_label_domain_id).toBe("dom_123");
    expect(data!.white_label_domain_verified).toBe(false);
  });

  it("refreshDomainStatus flips verified=true when Resend reports verified", async () => {
    const userId = await makeUser();
    await registerDomain(deps("not_started"), userId, "reports.agency.com");

    const result = await refreshDomainStatus(deps("verified"), userId, { triggerVerify: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.verified).toBe(true);

    const { data } = await admin
      .from("profiles")
      .select("white_label_domain_verified")
      .eq("id", userId)
      .single();
    expect(data!.white_label_domain_verified).toBe(true);
  });

  it("findUsersPendingDomainVerification includes recent unverified, excludes verified + stale", async () => {
    const pending = await makeUser();
    await registerDomain(deps("pending"), pending, "reports.agency.com");

    const verified = await makeUser();
    await registerDomain(deps("not_started"), verified, "reports.agency.com");
    await admin.from("profiles").update({ white_label_domain_verified: true }).eq("id", verified);

    const stale = await makeUser();
    await registerDomain(deps("pending"), stale, "reports.agency.com");
    await admin
      .from("profiles")
      .update({ white_label_domain_added_at: new Date(Date.now() - 25 * 3_600_000).toISOString() })
      .eq("id", stale);

    const ids = await findUsersPendingDomainVerification(admin);
    expect(ids).toContain(pending);
    expect(ids).not.toContain(verified);
    expect(ids).not.toContain(stale);
  });
});
