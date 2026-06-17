import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import type { BraveClient } from "@/lib/integrations/brave";
import type { FirecrawlClient, ScrapeResult } from "@/lib/integrations/firecrawl";
import type { Generator } from "@/lib/reports/generator";
import { getBattlecard, listBattlecards } from "@/lib/battlecards/history";
import { generateBattlecard, type BattlecardDeps } from "@/lib/battlecards/workflow";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!ANON || !SERVICE) throw new Error("Run pnpm db:start and set local keys.");

const admin: SupabaseClient = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdUserIds: string[] = [];

function mockFirecrawl(): FirecrawlClient {
  const ok = (): ScrapeResult => ({
    ok: true,
    markdown: "word ".repeat(300),
    wordCount: 300,
    scrapeLimited: false,
  });
  return { scrape: async () => ok() };
}
function mockBrave(): BraveClient {
  return { search: async () => ({ ok: true, results: [] }) };
}
function mockGenerator(): Generator {
  const data = {
    competitor_name: "Acme",
    positioning: "Mid-market analytics.",
    strengths: ["Fast setup"],
    weaknesses: ["Thin enterprise"],
    pricing: "From $79/mo",
    key_differentiators: ["No-code"],
    how_to_win: ["Lead with security"],
    landmines: ["Setup speed"],
    generated_at: "2026-06-17T00:00:00Z",
  };
  return {
    welcome: async () => {
      throw new Error("unused");
    },
    weekly: async () => {
      throw new Error("unused");
    },
    battlecard: async () => ({
      ok: true,
      data,
      usage: { input_tokens: 1, output_tokens: 1 },
      model: "claude",
      attempts: 1,
    }),
  };
}
function deps(): BattlecardDeps {
  return {
    supabase: admin,
    firecrawl: mockFirecrawl(),
    brave: mockBrave(),
    generator: mockGenerator(),
  };
}

async function makeUser(plan: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `bc-${randomUUID()}@inteloop.test`;
  const password = "Bc-Test-1!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("user not created");
  createdUserIds.push(data.user.id);
  await admin.from("profiles").update({ plan }).eq("id", data.user.id);
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, client };
}

async function addCompetitor(userId: string): Promise<string> {
  const { data, error } = await admin
    .from("competitors")
    .insert({ user_id: userId, name: "Acme", website_url: "https://acme.example" })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("competitor not created");
  return (data as { id: string }).id;
}

afterAll(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

describe("generateBattlecard (PRD §14)", () => {
  it("Pro user: generates and stores a battlecard", async () => {
    const pro = await makeUser("pro");
    const competitorId = await addCompetitor(pro.id);

    const result = await generateBattlecard(pro.id, competitorId, "pro", deps());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    const detail = await getBattlecard(admin, result.battlecardId);
    expect(detail?.content).toMatchObject({ competitor_name: "Acme" });
    expect(detail?.competitor?.name).toBe("Acme");
  });

  it("non-Pro user: gated with 403, nothing stored", async () => {
    const growth = await makeUser("growth");
    const competitorId = await addCompetitor(growth.id);

    const result = await generateBattlecard(growth.id, competitorId, "growth", deps());
    expect(result).toMatchObject({ ok: false, reason: "not_pro", status: 403 });

    const { count } = await admin
      .from("battlecards")
      .select("*", { count: "exact", head: true })
      .eq("user_id", growth.id);
    expect(count).toBe(0);
  });

  it("rejects a competitor the user doesn't own", async () => {
    const pro = await makeUser("pro");
    const other = await makeUser("pro");
    const foreignCompetitor = await addCompetitor(other.id);

    const result = await generateBattlecard(pro.id, foreignCompetitor, "pro", deps());
    expect(result).toMatchObject({ ok: false, reason: "competitor_not_found", status: 404 });
  });

  it("RLS: a user sees only their own battlecards", async () => {
    const pro = await makeUser("pro");
    const competitorId = await addCompetitor(pro.id);
    await generateBattlecard(pro.id, competitorId, "pro", deps());

    const own = await listBattlecards(pro.client);
    expect(own.length).toBe(1);

    const other = await makeUser("pro");
    const otherList = await listBattlecards(other.client);
    expect(otherList.length).toBe(0);
  });
});
