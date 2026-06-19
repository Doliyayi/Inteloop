import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import type { BraveClient } from "@/lib/integrations/brave";
import type { FirecrawlClient, ScrapeResult } from "@/lib/integrations/firecrawl";
import type { ResendClient, SendEmailResult } from "@/lib/integrations/resend";
import type { SlackMessage, SlackNotifier } from "@/lib/integrations/slack";
import type { Generator, GeneratorResult } from "@/lib/reports/generator";
import type { WeeklyReport } from "@/lib/reports/schemas";
import {
  findActiveSubscribers,
  findSubscribersMissingRecentReport,
  runWeeklyReport,
  type WeeklyWorkflowDeps,
} from "@/lib/reports/weeklyWorkflow";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SERVICE) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set. Run pnpm db:start first.");

const admin: SupabaseClient = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdUserIds: string[] = [];

async function createSubscriber(
  opts: {
    plan?: string;
    cancelledAt?: string | null;
    slackWebhookUrl?: string | null;
    competitor?: string | null;
  } = {},
): Promise<{ userId: string; email: string }> {
  const email = `weekly-${randomUUID()}@inteloop.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "Weekly-Test-1!",
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("user not created");
  const userId = data.user.id;
  createdUserIds.push(userId);

  await admin
    .from("profiles")
    .update({
      plan: opts.plan ?? "starter",
      cancelled_at: opts.cancelledAt ?? null,
      slack_webhook_url: opts.slackWebhookUrl ?? null,
    })
    .eq("id", userId);

  if (opts.competitor !== null) {
    await admin.from("competitors").insert({
      user_id: userId,
      name: opts.competitor ?? "Acme",
      website_url: "https://acme.example",
    });
  }
  return { userId, email };
}

afterAll(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

// --- Mock adapters -----------------------------------------------------------

function mockFirecrawl(): FirecrawlClient {
  const ok = (): ScrapeResult => ({
    ok: true,
    markdown: Array.from({ length: 300 }, (_, i) => `w${i}`).join(" "),
    wordCount: 300,
    scrapeLimited: false,
  });
  return { scrape: async () => ok() };
}

function mockBrave(): BraveClient {
  return {
    search: async () => ({
      ok: true,
      results: [
        {
          title: "Acme news",
          snippet: "summary",
          url: "https://news.example/a",
          date: "2026-06-13",
        },
      ],
    }),
  };
}

function weeklyReportData(overrides: Partial<WeeklyReport> = {}): WeeklyReport {
  return {
    report_date: "2026-06-15",
    executive_summary: ["Acme cut prices."],
    major_change: false,
    major_change_summary: null,
    competitors: [
      {
        name: "Acme",
        weekly_delta: "Cut prices 20%.",
        news: [],
        messaging_changes: null,
        strategic_implications: "Pressure on mid-tier.",
        signals_to_watch: ["annual discounts"],
      },
    ],
    ...overrides,
  };
}

function mockGenerator(data: WeeklyReport): Generator {
  const result: GeneratorResult<WeeklyReport> = {
    ok: true,
    data,
    usage: { input_tokens: 100, output_tokens: 50 },
    model: "claude-sonnet-4-5",
    attempts: 1,
  };
  return {
    welcome: async () => {
      throw new Error("welcome not used");
    },
    weekly: async () => result,
    battlecard: async () => {
      throw new Error("battlecard not used");
    },
    daily: async () => {
      throw new Error("daily not used");
    },
  };
}

function mockResend(result: SendEmailResult = { ok: true, id: "msg_weekly" }): ResendClient {
  return { send: async () => result };
}

type SlackCall = { url: string; message: SlackMessage };
function recordingSlack(calls: SlackCall[]): SlackNotifier {
  return {
    send: async (url, message) => {
      calls.push({ url, message });
      return { ok: true };
    },
  };
}

function buildDeps(overrides: Partial<WeeklyWorkflowDeps> = {}): WeeklyWorkflowDeps {
  return {
    supabase: admin,
    firecrawl: overrides.firecrawl ?? mockFirecrawl(),
    brave: overrides.brave ?? mockBrave(),
    generator: overrides.generator ?? mockGenerator(weeklyReportData()),
    resend: overrides.resend ?? mockResend(),
    slack: overrides.slack ?? recordingSlack([]),
    fromAddress: "Inteloop <noreply@inteloop.com>",
    appUrl: "https://app.inteloop.test",
  };
}

// --- Tests -------------------------------------------------------------------

describe("runWeeklyReport (PRD §9)", () => {
  it("happy path: sends email, inserts weekly report + links + usage", async () => {
    const { userId } = await createSubscriber({ competitor: "Acme" });
    const result = await runWeeklyReport(userId, buildDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    expect(result.competitorCount).toBe(1);
    expect(result.emailId).toBe("msg_weekly");
    expect(result.majorChange).toBe(false);

    const { data: report } = await admin
      .from("reports")
      .select("report_type, status, email_subject, delivered_at")
      .eq("id", result.reportId)
      .single();
    expect(report?.report_type).toBe("weekly");
    expect(report?.status).toBe("delivered");
    expect(report?.email_subject).toContain("2026-06-15");

    const { data: links } = await admin
      .from("report_competitors")
      .select("competitor_id")
      .eq("report_id", result.reportId);
    expect(links).toHaveLength(1);

    const { data: usage } = await admin.from("api_usage").select("provider").eq("user_id", userId);
    const providers = (usage ?? []).map((r) => (r as { provider: string }).provider);
    expect(providers).toEqual(expect.arrayContaining(["firecrawl", "brave", "claude", "resend"]));
  });

  it("fires a Slack alert when major_change is true and a webhook is configured (§9.3f/§12)", async () => {
    const { userId } = await createSubscriber({
      competitor: "Acme",
      slackWebhookUrl: "https://hooks.slack.com/services/T0/B0/abc",
    });
    const calls: SlackCall[] = [];
    const data = weeklyReportData({
      major_change: true,
      major_change_summary: "Acme acquired Beta.",
    });
    const result = await runWeeklyReport(
      userId,
      buildDeps({ generator: mockGenerator(data), slack: recordingSlack(calls) }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.slackAlerted).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.message.text).toContain("Acme acquired Beta.");
    expect(calls[0]!.message.text).toContain(result.reportId);
  });

  it("does not alert Slack when major_change is true but no webhook is set", async () => {
    const { userId } = await createSubscriber({ competitor: "Acme", slackWebhookUrl: null });
    const calls: SlackCall[] = [];
    const data = weeklyReportData({ major_change: true, major_change_summary: "Big news." });
    const result = await runWeeklyReport(
      userId,
      buildDeps({ generator: mockGenerator(data), slack: recordingSlack(calls) }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.slackAlerted).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("skips a non-subscribed user (trial plan)", async () => {
    const { userId } = await createSubscriber({ plan: "trial", competitor: "Acme" });
    const result = await runWeeklyReport(userId, buildDeps());
    expect(result).toMatchObject({ ok: false, reason: "not_subscribed" });
  });

  it("skips a cancelled subscriber", async () => {
    const { userId } = await createSubscriber({
      plan: "starter",
      cancelledAt: new Date().toISOString(),
      competitor: "Acme",
    });
    const result = await runWeeklyReport(userId, buildDeps());
    expect(result).toMatchObject({ ok: false, reason: "not_subscribed" });
  });

  it("skips a subscriber with no competitors", async () => {
    const { userId } = await createSubscriber({ competitor: null });
    const result = await runWeeklyReport(userId, buildDeps());
    expect(result).toMatchObject({ ok: false, reason: "no_competitors" });
  });

  it("does not persist a report when the email send fails (§9.5 isolation)", async () => {
    const { userId } = await createSubscriber({ competitor: "Acme" });
    const result = await runWeeklyReport(
      userId,
      buildDeps({ resend: mockResend({ ok: false, reason: "outage", status: 503 }) }),
    );
    expect(result).toMatchObject({ ok: false, reason: "email_failed" });
    const { data: reports } = await admin
      .from("reports")
      .select("id")
      .eq("user_id", userId)
      .eq("report_type", "weekly");
    expect(reports).toEqual([]);
  });
});

describe("batch queries (PRD §9.3 step 1, §21.6)", () => {
  it("findActiveSubscribers includes active paid users and excludes trial/cancelled", async () => {
    const active = await createSubscriber({ plan: "growth", competitor: "Acme" });
    const trial = await createSubscriber({ plan: "trial", competitor: "Acme" });
    const cancelled = await createSubscriber({
      plan: "pro",
      cancelledAt: new Date().toISOString(),
      competitor: "Acme",
    });

    const ids = await findActiveSubscribers(admin);
    expect(ids).toContain(active.userId);
    expect(ids).not.toContain(trial.userId);
    expect(ids).not.toContain(cancelled.userId);
  });

  it("findSubscribersMissingRecentReport excludes users with a recent weekly report", async () => {
    const fresh = await createSubscriber({ plan: "starter", competitor: "Acme" });
    const stale = await createSubscriber({ plan: "starter", competitor: "Acme" });

    // Give `fresh` a weekly report dated now; `stale` gets none.
    await admin.from("reports").insert({
      user_id: fresh.userId,
      report_type: "weekly",
      status: "delivered",
      content: {},
      delivered_at: new Date().toISOString(),
    });

    const missing = await findSubscribersMissingRecentReport(admin, 8);
    expect(missing).toContain(stale.userId);
    expect(missing).not.toContain(fresh.userId);
  });
});
