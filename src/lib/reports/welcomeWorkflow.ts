import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BraveClient } from "../integrations/brave";
import type { FirecrawlClient, ScrapeResult } from "../integrations/firecrawl";
import type { ResendClient, SendEmailResult } from "../integrations/resend";
import { brandedFromAddress, effectiveBranding } from "../whitelabel/branding";
import type { Generator, GeneratorResult } from "./generator";
import type { CompetitorInput } from "./prompts";
import type { WelcomeReport } from "./schemas";
import { logApiUsage, type ApiUsageRecord } from "./usage";
import {
  renderReminderEmailHtml,
  renderWelcomeReportHtml,
  reminderEmailSubject,
  welcomeReportSubject,
} from "./welcomeEmail";

// PRD §8.3 step 4: scrape homepage, /about, /pricing per competitor.
const SCRAPE_PATHS: ReadonlyArray<string> = ["/", "/about", "/pricing"];
// PRD §21.1 scrape_limited threshold (mirrors firecrawl adapter).
const COMBINED_SCRAPE_LIMIT_WORDS = 200;

export type WelcomeWorkflowDeps = {
  supabase: SupabaseClient; // service role — bypasses RLS
  firecrawl: FirecrawlClient;
  brave: BraveClient;
  generator: Generator;
  resend: ResendClient;
  fromAddress: string;
};

export type WelcomeReminderDeps = {
  supabase: SupabaseClient;
  resend: ResendClient;
  fromAddress: string;
  appUrl: string;
};

export type WelcomeWorkflowResult =
  | { ok: true; reportId: string; emailId: string; competitorCount: number }
  | {
      ok: false;
      reason:
        | "user_not_found"
        | "already_sent"
        | "no_competitors"
        | "claude_failed"
        | "email_failed";
      detail?: string;
    };

type ProfileRow = {
  id: string;
  email: string;
  welcome_report_sent: boolean;
  plan: string;
  white_label_enabled: boolean;
  white_label_sender_name: string | null;
  white_label_logo_url: string | null;
  white_label_footer_text: string | null;
};

const WHITE_LABEL_COLUMNS =
  "plan, white_label_enabled, white_label_sender_name, white_label_logo_url, white_label_footer_text";

type CompetitorRow = {
  id: string;
  name: string;
  website_url: string;
  notes: string | null;
};

// =========================================================
// Internals
// =========================================================

function buildCompetitorUrl(websiteUrl: string, path: string): string | null {
  try {
    return new URL(path, websiteUrl).toString();
  } catch {
    return null;
  }
}

function combinedWordCount(markdown: string): number {
  const trimmed = markdown.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

async function scrapeCompetitorPages(
  competitor: CompetitorRow,
  deps: WelcomeWorkflowDeps,
  userId: string,
): Promise<{ markdown: string; scrapeLimited: boolean }> {
  const targets = SCRAPE_PATHS.map((path) =>
    buildCompetitorUrl(competitor.website_url, path),
  ).filter((u): u is string => u !== null);

  const results = await Promise.all(
    targets.map(
      async (url): Promise<{ url: string; result: ScrapeResult }> => ({
        url,
        result: await deps.firecrawl.scrape(url),
      }),
    ),
  );

  for (const { result } of results) {
    void logApiUsage(deps.supabase, {
      user_id: userId,
      provider: "firecrawl",
      call_type: "scrape",
      status: result.ok ? "success" : result.reason,
      ...(result.ok
        ? {}
        : { error_detail: { reason: result.reason, status: result.status, error: result.error } }),
    });
  }

  const parts = results
    .map((r) => (r.result.ok ? r.result.markdown.trim() : ""))
    .filter((m) => m.length > 0);
  const combined = parts.join("\n\n").trim();
  return {
    markdown: combined,
    scrapeLimited: combinedWordCount(combined) < COMBINED_SCRAPE_LIMIT_WORDS,
  };
}

async function fetchNews(
  competitor: CompetitorRow,
  deps: WelcomeWorkflowDeps,
  userId: string,
): Promise<{ title: string; snippet: string; url: string; date?: string }[]> {
  const result = await deps.brave.search(`${competitor.name} news`, {
    type: "news",
    freshness: "pm",
    count: 5,
  });

  void logApiUsage(deps.supabase, {
    user_id: userId,
    provider: "brave",
    call_type: "search",
    status: result.ok ? "success" : result.reason,
    ...(result.ok
      ? {}
      : { error_detail: { reason: result.reason, status: result.status, error: result.error } }),
  });

  if (!result.ok) return [];
  return result.results.map((hit) => ({
    title: hit.title,
    snippet: hit.snippet,
    url: hit.url,
    ...(hit.date ? { date: hit.date } : {}),
  }));
}

async function gatherCompetitorInput(
  competitor: CompetitorRow,
  deps: WelcomeWorkflowDeps,
  userId: string,
): Promise<CompetitorInput> {
  const [{ markdown }, news] = await Promise.all([
    scrapeCompetitorPages(competitor, deps, userId),
    fetchNews(competitor, deps, userId),
  ]);

  return {
    name: competitor.name,
    website_url: competitor.website_url,
    scraped_content: markdown || null,
    news,
  };
}

async function logClaude(
  deps: WelcomeWorkflowDeps,
  userId: string,
  result: GeneratorResult<WelcomeReport>,
) {
  const base: Omit<ApiUsageRecord, "status"> = {
    user_id: userId,
    provider: "claude",
    call_type: "welcome",
    model: result.ok ? result.model : null,
    input_tokens: result.ok ? result.usage.input_tokens : null,
    output_tokens: result.ok ? result.usage.output_tokens : null,
  };
  void logApiUsage(deps.supabase, {
    ...base,
    status: result.ok ? "success" : result.reason,
    ...(result.ok
      ? {}
      : {
          error_detail: { reason: result.reason, error: result.error, attempts: result.attempts },
        }),
  });
}

async function logResend(deps: WelcomeWorkflowDeps, userId: string, result: SendEmailResult) {
  void logApiUsage(deps.supabase, {
    user_id: userId,
    provider: "resend",
    call_type: "welcome",
    status: result.ok ? "success" : result.reason,
    ...(result.ok
      ? {}
      : { error_detail: { reason: result.reason, status: result.status, error: result.error } }),
  });
}

// =========================================================
// Public API
// =========================================================

export async function runWelcomeWorkflow(
  userId: string,
  deps: WelcomeWorkflowDeps,
): Promise<WelcomeWorkflowResult> {
  // 1. Load profile.
  const { data: profile, error: profileError } = await deps.supabase
    .from("profiles")
    .select(`id, email, welcome_report_sent, ${WHITE_LABEL_COLUMNS}`)
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return { ok: false, reason: "user_not_found", detail: profileError.message };
  if (!profile) return { ok: false, reason: "user_not_found" };

  const typedProfile = profile as ProfileRow;
  // PRD §8.4 idempotency: once welcome_report_sent is true, the hourly
  // fallback should be a no-op for this user.
  if (typedProfile.welcome_report_sent) return { ok: false, reason: "already_sent" };

  // 2. Load active competitors.
  const { data: competitorsData } = await deps.supabase
    .from("competitors")
    .select("id, name, website_url, notes")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  const competitors = (competitorsData ?? []) as CompetitorRow[];
  if (competitors.length === 0) return { ok: false, reason: "no_competitors" };

  // 3. Per-competitor data gather (Firecrawl + Brave in parallel inside each).
  const competitorInputs = await Promise.all(
    competitors.map((c) => gatherCompetitorInput(c, deps, userId)),
  );

  // 4. Claude.
  const claudeResult = await deps.generator.welcome({ competitors: competitorInputs });
  await logClaude(deps, userId, claudeResult);
  if (!claudeResult.ok) {
    return {
      ok: false,
      reason: "claude_failed",
      detail: `${claudeResult.reason}: ${claudeResult.error ?? ""}`.trim(),
    };
  }

  // 5. Render + send. PRD §8.4: welcome_report_sent only flips after a
  // successful Resend delivery. White-label branding (§13) applies for
  // Growth/Pro subscribers who've enabled it.
  const branding = effectiveBranding(typedProfile);
  const html = renderWelcomeReportHtml(claudeResult.data, branding);
  const subject = welcomeReportSubject(claudeResult.data);
  const sendResult = await deps.resend.send({
    from: brandedFromAddress(deps.fromAddress, branding),
    to: typedProfile.email,
    subject,
    html,
  });
  await logResend(deps, userId, sendResult);
  if (!sendResult.ok) {
    return {
      ok: false,
      reason: "email_failed",
      detail: `${sendResult.reason}: ${sendResult.error ?? ""}`.trim(),
    };
  }

  // 6. Persist. reports → report_competitors → profiles flag. We accept that
  // a crash between these steps could leave the flag unset; the hourly
  // fallback will re-deliver. Use the email subject for human-readable history.
  const { data: reportRow, error: insertError } = await deps.supabase
    .from("reports")
    .insert({
      user_id: userId,
      report_type: "welcome",
      status: "delivered",
      content: claudeResult.data,
      email_subject: subject,
      delivered_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertError || !reportRow) {
    return {
      ok: false,
      reason: "email_failed",
      detail: `report insert failed: ${insertError?.message ?? "unknown"}`,
    };
  }

  const reportId = (reportRow as { id: string }).id;

  // Link report to competitors that were included in this report. scrape_limited
  // is sourced from the Claude output's per-competitor flag.
  const links = competitors.map((c) => {
    const matched = claudeResult.data.competitors.find((x) => x.name === c.name);
    return {
      report_id: reportId,
      competitor_id: c.id,
      scrape_limited: matched?.scrape_limited ?? false,
    };
  });
  if (links.length > 0) {
    await deps.supabase.from("report_competitors").insert(links);
  }

  await deps.supabase.from("profiles").update({ welcome_report_sent: true }).eq("id", userId);

  return {
    ok: true,
    reportId,
    emailId: sendResult.id,
    competitorCount: competitors.length,
  };
}

// =========================================================
// Reminder email — PRD §8.3 step 2 / §18.
// Caller (n8n branch after 10-minute wait) decides whether to invoke this.
// =========================================================
export async function sendWelcomeReminder(
  userId: string,
  deps: WelcomeReminderDeps,
): Promise<SendEmailResult | { ok: false; reason: "user_not_found" }> {
  const { data: profile } = await deps.supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return { ok: false, reason: "user_not_found" };

  return deps.resend.send({
    from: deps.fromAddress,
    to: (profile as { email: string }).email,
    subject: reminderEmailSubject(),
    html: renderReminderEmailHtml({ appUrl: deps.appUrl }),
  });
}

// =========================================================
// Fallback query — PRD §8.4: hourly cron picks up users whose welcome report
// wasn't delivered despite their having submitted competitors.
// =========================================================
export async function findUsersPendingWelcomeReport(
  supabase: SupabaseClient,
  limit = 50,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, competitors!inner(id)")
    .eq("welcome_report_sent", false)
    .eq("competitors.is_active", true)
    .limit(limit);
  if (error || !data) return [];

  const seen = new Set<string>();
  for (const row of data as Array<{ id: string }>) {
    seen.add(row.id);
  }
  return [...seen];
}
