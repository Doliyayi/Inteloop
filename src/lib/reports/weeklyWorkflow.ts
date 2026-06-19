import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BraveClient } from "../integrations/brave";
import type { FirecrawlClient, ScrapeResult } from "../integrations/firecrawl";
import type { ResendClient, SendEmailResult } from "../integrations/resend";
import { formatMajorChangeAlert, type SlackNotifier } from "../integrations/slack";
import { brandedFromAddress, effectiveBranding } from "../whitelabel/branding";
import type { Generator, GeneratorResult } from "./generator";
import type { CompetitorInput } from "./prompts";
import type { WeeklyReport } from "./schemas";
import { logApiUsage, type ApiUsageRecord } from "./usage";
import { renderWeeklyReportHtml, weeklyReportSubject } from "./weeklyEmail";

// Weekly report workflow — PRD §9. Mirrors welcomeWorkflow.ts: a single
// subscriber's report is produced end-to-end here, and the n8n Monday cron
// fans this out across all active subscribers via the batch route.

// §9.3c: homepage + /about + /pricing per competitor.
const SCRAPE_PATHS: ReadonlyArray<string> = ["/", "/about", "/pricing"];
const COMBINED_SCRAPE_LIMIT_WORDS = 200; // §21.1
const PAID_PLANS = new Set(["starter", "growth", "pro"]);
const PREVIOUS_SUMMARY_MAX_CHARS = 1_500; // §9.5: summary, not full text.

export type WeeklyWorkflowDeps = {
  supabase: SupabaseClient; // service role — bypasses RLS
  firecrawl: FirecrawlClient;
  brave: BraveClient;
  generator: Generator;
  resend: ResendClient;
  slack: SlackNotifier;
  fromAddress: string;
  appUrl: string;
};

export type WeeklyWorkflowResult =
  | {
      ok: true;
      reportId: string;
      emailId: string;
      competitorCount: number;
      majorChange: boolean;
      slackAlerted: boolean;
    }
  | {
      ok: false;
      reason:
        | "user_not_found"
        | "not_subscribed"
        | "no_competitors"
        | "claude_failed"
        | "email_failed";
      detail?: string;
    };

type ProfileRow = {
  id: string;
  email: string;
  plan: string;
  cancelled_at: string | null;
  slack_webhook_url: string | null;
  white_label_enabled: boolean;
  white_label_sender_name: string | null;
  white_label_logo_url: string | null;
  white_label_footer_text: string | null;
  white_label_domain: string | null;
  white_label_domain_verified: boolean;
};

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

// Domain (host) for the §9.3b site: search operator.
function competitorDomain(websiteUrl: string): string | null {
  try {
    return new URL(websiteUrl).hostname;
  } catch {
    return null;
  }
}

async function scrapeCompetitorPages(
  competitor: CompetitorRow,
  deps: WeeklyWorkflowDeps,
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
  deps: WeeklyWorkflowDeps,
  userId: string,
): Promise<{ title: string; snippet: string; url: string; date?: string }[]> {
  // §9.3b: past-week freshness, name + site/news query.
  const domain = competitorDomain(competitor.website_url);
  const query = domain
    ? `${competitor.name} site:${domain} OR "${competitor.name}" news`
    : `"${competitor.name}" news`;
  const result = await deps.brave.search(query, { type: "news", freshness: "pw", count: 5 });

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
  deps: WeeklyWorkflowDeps,
  userId: string,
): Promise<{ input: CompetitorInput; scrapeLimited: boolean }> {
  const [{ markdown, scrapeLimited }, news] = await Promise.all([
    scrapeCompetitorPages(competitor, deps, userId),
    fetchNews(competitor, deps, userId),
  ]);

  return {
    scrapeLimited,
    input: {
      name: competitor.name,
      website_url: competitor.website_url,
      scraped_content: markdown || null,
      news,
    },
  };
}

// §9.3d / §9.5: condense the most recent stored report into a short summary
// for delta analysis. Handles both weekly and welcome report shapes (the first
// weekly report follows a welcome report).
export function buildPreviousReportSummary(content: unknown): string | null {
  if (!content || typeof content !== "object") return null;
  const c = content as Record<string, unknown>;
  const lines: string[] = [];

  if (Array.isArray(c.executive_summary)) {
    for (const bullet of c.executive_summary) {
      if (typeof bullet === "string") lines.push(`- ${bullet}`);
    }
  }

  if (Array.isArray(c.competitors)) {
    for (const comp of c.competitors as Array<Record<string, unknown>>) {
      const name = typeof comp.name === "string" ? comp.name : null;
      if (!name) continue;
      // weekly_delta (weekly) or snapshot (welcome).
      const detail =
        typeof comp.weekly_delta === "string"
          ? comp.weekly_delta
          : typeof comp.snapshot === "string"
            ? comp.snapshot
            : null;
      lines.push(detail ? `${name}: ${detail}` : name);
    }
  }

  if (lines.length === 0) return null;
  const summary = lines.join("\n");
  return summary.length > PREVIOUS_SUMMARY_MAX_CHARS
    ? `${summary.slice(0, PREVIOUS_SUMMARY_MAX_CHARS)}…`
    : summary;
}

async function fetchPreviousReportSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("reports")
    .select("content")
    .eq("user_id", userId)
    .in("report_type", ["weekly", "welcome"])
    .eq("status", "delivered")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return buildPreviousReportSummary((data as { content: unknown }).content);
}

async function logClaude(
  deps: WeeklyWorkflowDeps,
  userId: string,
  result: GeneratorResult<WeeklyReport>,
) {
  const base: Omit<ApiUsageRecord, "status"> = {
    user_id: userId,
    provider: "claude",
    call_type: "weekly",
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

async function logResend(deps: WeeklyWorkflowDeps, userId: string, result: SendEmailResult) {
  void logApiUsage(deps.supabase, {
    user_id: userId,
    provider: "resend",
    call_type: "weekly",
    status: result.ok ? "success" : result.reason,
    ...(result.ok
      ? {}
      : { error_detail: { reason: result.reason, status: result.status, error: result.error } }),
  });
}

// §9.3f / §12: fire the Slack alert. Never fails the report — a webhook problem
// is logged and swallowed.
async function maybeAlertSlack(
  deps: WeeklyWorkflowDeps,
  profile: ProfileRow,
  report: WeeklyReport,
  reportId: string,
): Promise<boolean> {
  if (!report.major_change || !profile.slack_webhook_url) return false;
  const message = formatMajorChangeAlert({
    summary: report.major_change_summary ?? "A major competitive change was detected this week.",
    reportUrl: `${deps.appUrl}/dashboard/reports/${reportId}`,
  });
  const result = await deps.slack.send(profile.slack_webhook_url, message);
  if (!result.ok) {
    console.error(`[slack] alert failed for user ${profile.id}: ${result.reason}`);
    return false;
  }
  return true;
}

// =========================================================
// Public API
// =========================================================

export async function runWeeklyReport(
  userId: string,
  deps: WeeklyWorkflowDeps,
): Promise<WeeklyWorkflowResult> {
  // 1. Load profile and confirm the subscriber is active (§9.3 step 1).
  const { data: profile, error: profileError } = await deps.supabase
    .from("profiles")
    .select(
      "id, email, plan, cancelled_at, slack_webhook_url, white_label_enabled, white_label_sender_name, white_label_logo_url, white_label_footer_text, white_label_domain, white_label_domain_verified",
    )
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return { ok: false, reason: "user_not_found", detail: profileError.message };
  if (!profile) return { ok: false, reason: "user_not_found" };

  const typedProfile = profile as ProfileRow;
  if (!PAID_PLANS.has(typedProfile.plan) || typedProfile.cancelled_at !== null) {
    return { ok: false, reason: "not_subscribed" };
  }

  // 2. Load active competitors.
  const { data: competitorsData } = await deps.supabase
    .from("competitors")
    .select("id, name, website_url, notes")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  const competitors = (competitorsData ?? []) as CompetitorRow[];
  if (competitors.length === 0) return { ok: false, reason: "no_competitors" };

  // 3. Gather current-week data + previous report summary in parallel.
  const [gathered, previousSummary] = await Promise.all([
    Promise.all(competitors.map((c) => gatherCompetitorInput(c, deps, userId))),
    fetchPreviousReportSummary(deps.supabase, userId),
  ]);

  // 4. Claude weekly report.
  const claudeResult = await deps.generator.weekly({
    competitors: gathered.map((g) => g.input),
    previous_report_summary: previousSummary,
  });
  await logClaude(deps, userId, claudeResult);
  if (!claudeResult.ok) {
    return {
      ok: false,
      reason: "claude_failed",
      detail: `${claudeResult.reason}: ${claudeResult.error ?? ""}`.trim(),
    };
  }

  // 5. Render + send. White-label branding (§13) for Growth/Pro subscribers.
  const branding = effectiveBranding(typedProfile);
  const html = renderWeeklyReportHtml(claudeResult.data, branding);
  const subject = weeklyReportSubject(claudeResult.data);
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

  // 6. Persist report + competitor links (§9.3 step h).
  const { data: reportRow, error: insertError } = await deps.supabase
    .from("reports")
    .insert({
      user_id: userId,
      report_type: "weekly",
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

  const links = competitors.map((c, i) => ({
    report_id: reportId,
    competitor_id: c.id,
    scrape_limited: gathered[i]?.scrapeLimited ?? false,
  }));
  if (links.length > 0) {
    await deps.supabase.from("report_competitors").insert(links);
  }

  // 7. Slack alert on a major change (§9.3f / §12).
  const slackAlerted = await maybeAlertSlack(deps, typedProfile, claudeResult.data, reportId);

  return {
    ok: true,
    reportId,
    emailId: sendResult.id,
    competitorCount: competitors.length,
    majorChange: claudeResult.data.major_change,
    slackAlerted,
  };
}

// =========================================================
// Batch queries — driven by the Monday cron (§9.3 step 1) and the §21.6
// recovery cron.
// =========================================================

export async function findActiveSubscribers(
  supabase: SupabaseClient,
  limit = 1_000,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .in("plan", ["starter", "growth", "pro"])
    .is("cancelled_at", null)
    .limit(limit);
  if (error || !data) return [];
  return (data as Array<{ id: string }>).map((r) => r.id);
}

// §21.6: active subscribers who have not received a weekly report in the past
// `days` days — used by the recovery cron after a missed Monday run.
export async function findSubscribersMissingRecentReport(
  supabase: SupabaseClient,
  days = 8,
  limit = 1_000,
): Promise<string[]> {
  const active = await findActiveSubscribers(supabase, limit);
  if (active.length === 0) return [];

  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await supabase
    .from("reports")
    .select("user_id")
    .eq("report_type", "weekly")
    .gte("created_at", cutoff)
    .in("user_id", active);
  const recent = new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  return active.filter((id) => !recent.has(id));
}
