import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BraveClient } from "../integrations/brave";
import type { ResendClient, SendEmailResult } from "../integrations/resend";
import { formatMajorChangeAlert, type SlackNotifier } from "../integrations/slack";
import { brandedFromAddress, effectiveBranding } from "../whitelabel/branding";
import type { Generator, GeneratorResult } from "./generator";
import type { CompetitorInput } from "./prompts";
import type { DailyBriefing } from "./schemas";
import { logApiUsage, type ApiUsageRecord } from "./usage";
import { dailyBriefingSubject, renderDailyBriefingHtml } from "./dailyEmail";

// Daily briefing workflow — PRD §9.4. Pro-plan only, news-only (no Firecrawl),
// Monday–Friday 07:00 UTC. Structure mirrors weeklyWorkflow.ts.

// §9.4: past 24 hours freshness for Brave news search.
const NEWS_FRESHNESS = "pd" as const;
const NEWS_COUNT = 5;

export type DailyWorkflowDeps = {
  supabase: SupabaseClient;
  brave: BraveClient;
  generator: Generator;
  resend: ResendClient;
  slack: SlackNotifier;
  fromAddress: string;
  appUrl: string;
};

export type DailyWorkflowResult =
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
      reason: "user_not_found" | "not_pro" | "no_competitors" | "claude_failed" | "email_failed";
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
};

function competitorDomain(websiteUrl: string): string | null {
  try {
    return new URL(websiteUrl).hostname;
  } catch {
    return null;
  }
}

async function fetchNews(
  competitor: CompetitorRow,
  deps: DailyWorkflowDeps,
  userId: string,
): Promise<{ title: string; snippet: string; url: string; date?: string }[]> {
  const domain = competitorDomain(competitor.website_url);
  const query = domain
    ? `${competitor.name} site:${domain} OR "${competitor.name}" news`
    : `"${competitor.name}" news`;
  const result = await deps.brave.search(query, {
    type: "news",
    freshness: NEWS_FRESHNESS,
    count: NEWS_COUNT,
  });

  void logApiUsage(deps.supabase, {
    user_id: userId,
    provider: "brave",
    call_type: "daily",
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

async function logClaude(
  deps: DailyWorkflowDeps,
  userId: string,
  result: GeneratorResult<DailyBriefing>,
) {
  const base: Omit<ApiUsageRecord, "status"> = {
    user_id: userId,
    provider: "claude",
    call_type: "daily",
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

async function logResend(deps: DailyWorkflowDeps, userId: string, result: SendEmailResult) {
  void logApiUsage(deps.supabase, {
    user_id: userId,
    provider: "resend",
    call_type: "daily",
    status: result.ok ? "success" : result.reason,
    ...(result.ok
      ? {}
      : { error_detail: { reason: result.reason, status: result.status, error: result.error } }),
  });
}

async function maybeAlertSlack(
  deps: DailyWorkflowDeps,
  profile: ProfileRow,
  report: DailyBriefing,
  reportId: string,
): Promise<boolean> {
  if (!report.major_change || !profile.slack_webhook_url) return false;
  const message = formatMajorChangeAlert({
    summary: report.major_change_summary ?? "A major competitive change was detected today.",
    reportUrl: `${deps.appUrl}/dashboard/reports/${reportId}`,
  });
  const result = await deps.slack.send(profile.slack_webhook_url, message);
  if (!result.ok) {
    console.error(`[slack] daily alert failed for user ${profile.id}: ${result.reason}`);
    return false;
  }
  return true;
}

export async function runDailyBriefing(
  userId: string,
  deps: DailyWorkflowDeps,
): Promise<DailyWorkflowResult> {
  // 1. Load profile — Pro plan only (§9.4).
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
  if (typedProfile.plan !== "pro" || typedProfile.cancelled_at !== null) {
    return { ok: false, reason: "not_pro" };
  }

  // 2. Load active competitors.
  const { data: competitorsData } = await deps.supabase
    .from("competitors")
    .select("id, name, website_url")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  const competitors = (competitorsData ?? []) as CompetitorRow[];
  if (competitors.length === 0) return { ok: false, reason: "no_competitors" };

  // 3. Fetch 24h news for each competitor (no scraping — §9.4 cost control).
  const newsResults = await Promise.all(competitors.map((c) => fetchNews(c, deps, userId)));

  const competitorInputs: CompetitorInput[] = competitors.map((c, i) => ({
    name: c.name,
    website_url: c.website_url,
    scraped_content: null,
    news: newsResults[i] ?? [],
  }));

  // 4. Claude daily briefing.
  const claudeResult = await deps.generator.daily({ competitors: competitorInputs });
  await logClaude(deps, userId, claudeResult);
  if (!claudeResult.ok) {
    return {
      ok: false,
      reason: "claude_failed",
      detail: `${claudeResult.reason}: ${claudeResult.error ?? ""}`.trim(),
    };
  }

  // 5. Render + send. White-label branding for Pro subscribers.
  const branding = effectiveBranding(typedProfile);
  const html = renderDailyBriefingHtml(claudeResult.data, branding);
  const subject = dailyBriefingSubject(claudeResult.data);
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

  // 6. Persist report.
  const { data: reportRow, error: insertError } = await deps.supabase
    .from("reports")
    .insert({
      user_id: userId,
      report_type: "daily",
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

  const links = competitors.map((c) => ({
    report_id: reportId,
    competitor_id: c.id,
    scrape_limited: false,
  }));
  if (links.length > 0) {
    await deps.supabase.from("report_competitors").insert(links);
  }

  // 7. Slack alert on a major change.
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
// Batch query — Pro subscribers only (§9.4).
// =========================================================

export async function findProSubscribers(
  supabase: SupabaseClient,
  limit = 1_000,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("plan", "pro")
    .is("cancelled_at", null)
    .limit(limit);
  if (error || !data) return [];
  return (data as Array<{ id: string }>).map((r) => r.id);
}
