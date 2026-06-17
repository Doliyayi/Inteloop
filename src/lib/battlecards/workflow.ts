import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { hasCapability } from "../billing/capabilities";
import type { BraveClient } from "../integrations/brave";
import type { FirecrawlClient, ScrapeResult } from "../integrations/firecrawl";
import type { Generator } from "../reports/generator";
import type { CompetitorInput } from "../reports/prompts";
import { logApiUsage } from "../reports/usage";

// On-demand battlecard generation (PRD §14). Pro-only. Gathers fresh data for a
// single competitor (scrape + news), runs the sales-enablement Claude prompt,
// and stores the result in the battlecards table.

const SCRAPE_PATHS: ReadonlyArray<string> = ["/", "/about", "/pricing"];

export type BattlecardDeps = {
  supabase: SupabaseClient; // service role
  firecrawl: FirecrawlClient;
  brave: BraveClient;
  generator: Generator;
};

export type BattlecardResult =
  | { ok: true; battlecardId: string }
  | {
      ok: false;
      reason: "not_pro" | "competitor_not_found" | "claude_failed";
      status: number;
      error: string;
    };

type CompetitorRow = { id: string; name: string; website_url: string };

function buildUrl(websiteUrl: string, path: string): string | null {
  try {
    return new URL(path, websiteUrl).toString();
  } catch {
    return null;
  }
}

async function gatherCompetitor(
  competitor: CompetitorRow,
  deps: BattlecardDeps,
  userId: string,
): Promise<CompetitorInput> {
  const targets = SCRAPE_PATHS.map((p) => buildUrl(competitor.website_url, p)).filter(
    (u): u is string => u !== null,
  );

  const scrapes = await Promise.all(
    targets.map(async (url): Promise<ScrapeResult> => deps.firecrawl.scrape(url)),
  );
  for (const result of scrapes) {
    void logApiUsage(deps.supabase, {
      user_id: userId,
      provider: "firecrawl",
      call_type: "battlecard",
      status: result.ok ? "success" : result.reason,
      ...(result.ok
        ? {}
        : { error_detail: { reason: result.reason, status: result.status, error: result.error } }),
    });
  }
  const markdown = scrapes
    .map((r) => (r.ok ? r.markdown.trim() : ""))
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const news = await deps.brave.search(`${competitor.name} reviews OR pricing OR news`, {
    type: "news",
    freshness: "pm",
    count: 5,
  });
  void logApiUsage(deps.supabase, {
    user_id: userId,
    provider: "brave",
    call_type: "battlecard",
    status: news.ok ? "success" : news.reason,
    ...(news.ok
      ? {}
      : { error_detail: { reason: news.reason, status: news.status, error: news.error } }),
  });

  return {
    name: competitor.name,
    website_url: competitor.website_url,
    scraped_content: markdown || null,
    news: news.ok
      ? news.results.map((h) => ({
          title: h.title,
          snippet: h.snippet,
          url: h.url,
          ...(h.date ? { date: h.date } : {}),
        }))
      : [],
  };
}

export async function generateBattlecard(
  userId: string,
  competitorId: string,
  plan: string,
  deps: BattlecardDeps,
): Promise<BattlecardResult> {
  // §14.3: Pro only.
  if (!hasCapability(plan, "battlecards")) {
    return {
      ok: false,
      reason: "not_pro",
      status: 403,
      error: "Battlecards are a Pro feature. Upgrade to generate them.",
    };
  }

  // Ownership: the competitor must belong to this user and be active.
  const { data: competitorData } = await deps.supabase
    .from("competitors")
    .select("id, name, website_url")
    .eq("id", competitorId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  const competitor = competitorData as CompetitorRow | null;
  if (!competitor) {
    return {
      ok: false,
      reason: "competitor_not_found",
      status: 404,
      error: "Competitor not found.",
    };
  }

  const input = await gatherCompetitor(competitor, deps, userId);
  const result = await deps.generator.battlecard({ competitor: input });
  void logApiUsage(deps.supabase, {
    user_id: userId,
    provider: "claude",
    call_type: "battlecard",
    model: result.ok ? result.model : null,
    input_tokens: result.ok ? result.usage.input_tokens : null,
    output_tokens: result.ok ? result.usage.output_tokens : null,
    status: result.ok ? "success" : result.reason,
    ...(result.ok ? {} : { error_detail: { reason: result.reason, error: result.error } }),
  });
  if (!result.ok) {
    return {
      ok: false,
      reason: "claude_failed",
      status: 502,
      error: `${result.reason}: ${result.error ?? ""}`.trim(),
    };
  }

  const { data: row, error } = await deps.supabase
    .from("battlecards")
    .insert({ user_id: userId, competitor_id: competitor.id, content: result.data })
    .select("id")
    .single();
  if (error || !row) {
    return {
      ok: false,
      reason: "claude_failed",
      status: 500,
      error: `battlecard insert failed: ${error?.message ?? "unknown"}`,
    };
  }

  return { ok: true, battlecardId: (row as { id: string }).id };
}
