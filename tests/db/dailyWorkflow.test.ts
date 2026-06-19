import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import type { BraveClient } from "@/lib/integrations/brave";
import type { ResendClient, SendEmailResult } from "@/lib/integrations/resend";
import type { SlackMessage, SlackNotifier } from "@/lib/integrations/slack";
import type { Generator, GeneratorResult } from "@/lib/reports/generator";
import type { DailyBriefing } from "@/lib/reports/schemas";
import {
  findProSubscribers,
  runDailyBriefing,
  type DailyWorkflowDeps,
} from "@/lib/reports/dailyWorkflow";

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
  const email = `daily-${randomUUID()}@inteloop.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "Daily-Test-1!",
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("user not created");
  const userId = data.user.id;
  createdUserIds.push(userId);

  await admin
    .from("profiles")
    .update({
      plan: opts.plan ?? "pro",
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

function mockBrave(): BraveClient {
  return {
    search: async () => ({
      ok: true,
      results: [
        {
          title: "Acme news today",
          snippet: "summary",
          url: "https://news.example/a",
          date: "2026-06-19",
        },
      ],
    }),
  };
}

function dailyReportData(overrides: Partial<DailyBriefing> = {}): DailyBriefing {
  return {
    report_date: "2026-06-19",
    summary: "No major changes today.",
    major_change: false,
    major_change_summary: null,
    items: [
      {
        competitor: "Acme",
        headline: "Acme news today",
        summary: "summary",
        url: "https://news.example/a",
      },
    ],
    ...overrides,
  };
}

function mockGenerator(data?: DailyBriefing | GeneratorResult<DailyBriefing>): Generator {
  const result: GeneratorResult<DailyBriefing> =
    data && "ok" in data
      ? (data as GeneratorResult<DailyBriefing>)
      : {
          ok: true,
          data: data ?? dailyReportData(),
          usage: { input_tokens: 100, output_tokens: 50 },
          model: "claude-sonnet-4-5",
          attempts: 1,
        };
  return {
    welcome: async () => {
      throw new Error("welcome not used");
    },
    weekly: async () => {
      throw new Error("weekly not used");
    },
    battlecard: async () => {
      throw new Error("battlecard not used");
    },
    daily: async () => result,
  };
}

function mockResend(result: SendEmailResult = { ok: true, id: "msg_daily" }): ResendClient {
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

function buildDeps(overrides: Partial<DailyWorkflowDeps> = {}): DailyWorkflowDeps {
  return {
    supabase: admin,
    brave: overrides.brave ?? mockBrave(),
    generator: overrides.generator ?? mockGenerator(),
    resend: overrides.resend ?? mockResend(),
    slack: overrides.slack ?? recordingSlack([]),
    fromAddress: "Inteloop <noreply@inteloop.com>",
    appUrl: "https://app.inteloop.test",
  };
}

// --- Tests -------------------------------------------------------------------

describe("runDailyBriefing (PRD §9.4)", () => {
  it("happy path: sends email, inserts daily report + links + usage", async () => {
    const { userId } = await createSubscriber({ competitor: "Acme" });
    const result = await runDailyBriefing(userId, buildDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    expect(result.competitorCount).toBe(1);
    expect(result.emailId).toBe("msg_daily");
    expect(result.majorChange).toBe(false);

    const { data: report } = await admin
      .from("reports")
      .select("report_type, status, email_subject, delivered_at, content")
      .eq("id", result.reportId)
      .single();
    expect(report?.report_type).toBe("daily");
    expect(report?.status).toBe("delivered");
    expect(report?.email_subject).toContain("2026-06-19");
    expect(report?.delivered_at).toBeTruthy();
    expect(report?.content).toMatchObject({ report_date: "2026-06-19" });

    const { data: links } = await admin
      .from("report_competitors")
      .select("competitor_id")
      .eq("report_id", result.reportId);
    expect(links).toHaveLength(1);

    const { data: usage } = await admin.from("api_usage").select("provider").eq("user_id", userId);
    const providers = (usage ?? []).map((r) => (r as { provider: string }).provider);
    expect(providers).toEqual(expect.arrayContaining(["brave", "claude", "resend"]));
    expect(providers).not.toContain("firecrawl");
  });

  it("fires a Slack alert when major_change is true and a webhook is configured (§9.4/§12)", async () => {
    const { userId } = await createSubscriber({
      competitor: "Acme",
      slackWebhookUrl: "https://hooks.slack.com/services/T0/B0/daily",
    });
    const calls: SlackCall[] = [];
    const data = dailyReportData({
      major_change: true,
      major_change_summary: "Acme slashed prices 30%.",
    });
    const result = await runDailyBriefing(
      userId,
      buildDeps({ generator: mockGenerator(data), slack: recordingSlack(calls) }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.slackAlerted).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.message.text).toContain("Acme slashed prices 30%.");
    expect(calls[0]!.message.text).toContain(result.reportId);
  });

  it("does not alert Slack when major_change is true but no webhook is set", async () => {
    const { userId } = await createSubscriber({ competitor: "Acme", slackWebhookUrl: null });
    const calls: SlackCall[] = [];
    const data = dailyReportData({ major_change: true, major_change_summary: "Big news." });
    const result = await runDailyBriefing(
      userId,
      buildDeps({ generator: mockGenerator(data), slack: recordingSlack(calls) }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.slackAlerted).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("returns not_pro for a non-Pro subscriber (§9.4 Pro-only gate)", async () => {
    const { userId } = await createSubscriber({ plan: "growth", competitor: "Acme" });
    const result = await runDailyBriefing(userId, buildDeps());
    expect(result).toMatchObject({ ok: false, reason: "not_pro" });
  });

  it("returns not_pro for a cancelled Pro subscriber", async () => {
    const { userId } = await createSubscriber({
      plan: "pro",
      cancelledAt: new Date().toISOString(),
      competitor: "Acme",
    });
    const result = await runDailyBriefing(userId, buildDeps());
    expect(result).toMatchObject({ ok: false, reason: "not_pro" });
  });

  it("returns no_competitors when the user has none", async () => {
    const { userId } = await createSubscriber({ competitor: null });
    const result = await runDailyBriefing(userId, buildDeps());
    expect(result).toMatchObject({ ok: false, reason: "no_competitors" });
  });

  it("returns claude_failed and does NOT send email when generator fails", async () => {
    const { userId } = await createSubscriber({ competitor: "Acme" });
    let resendCallCount = 0;
    const resendCounter: ResendClient = {
      send: async () => {
        resendCallCount += 1;
        return { ok: true, id: "msg_x" };
      },
    };
    const result = await runDailyBriefing(
      userId,
      buildDeps({
        generator: mockGenerator({
          ok: false,
          reason: "rate_limited",
          error: "exhausted",
          attempts: 4,
        }),
        resend: resendCounter,
      }),
    );
    expect(result).toMatchObject({ ok: false, reason: "claude_failed" });
    expect(resendCallCount).toBe(0);

    const { data: reports } = await admin
      .from("reports")
      .select("id")
      .eq("user_id", userId)
      .eq("report_type", "daily");
    expect(reports).toEqual([]);
  });

  it("does not persist a report when the email send fails (§9.5 isolation)", async () => {
    const { userId } = await createSubscriber({ competitor: "Acme" });
    const result = await runDailyBriefing(
      userId,
      buildDeps({ resend: mockResend({ ok: false, reason: "outage", status: 503 }) }),
    );
    expect(result).toMatchObject({ ok: false, reason: "email_failed" });
    const { data: reports } = await admin
      .from("reports")
      .select("id")
      .eq("user_id", userId)
      .eq("report_type", "daily");
    expect(reports).toEqual([]);
  });
});

describe("findProSubscribers (PRD §9.4)", () => {
  it("returns only active Pro users, excluding trial/growth/cancelled", async () => {
    const pro = await createSubscriber({ plan: "pro" });
    const growth = await createSubscriber({ plan: "growth" });
    const trial = await createSubscriber({ plan: "trial" });
    const cancelled = await createSubscriber({
      plan: "pro",
      cancelledAt: new Date().toISOString(),
    });

    const ids = await findProSubscribers(admin);
    expect(ids).toContain(pro.userId);
    expect(ids).not.toContain(growth.userId);
    expect(ids).not.toContain(trial.userId);
    expect(ids).not.toContain(cancelled.userId);
  });
});
