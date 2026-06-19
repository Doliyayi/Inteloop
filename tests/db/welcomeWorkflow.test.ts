import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import type { BraveClient } from "@/lib/integrations/brave";
import type { FirecrawlClient, ScrapeResult } from "@/lib/integrations/firecrawl";
import type { ResendClient, SendEmailResult } from "@/lib/integrations/resend";
import type { Generator, GeneratorResult } from "@/lib/reports/generator";
import { WELCOME_CLOSING_LINE, type WelcomeReport } from "@/lib/reports/schemas";
import {
  findUsersPendingWelcomeReport,
  runWelcomeWorkflow,
  type WelcomeWorkflowDeps,
} from "@/lib/reports/welcomeWorkflow";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SERVICE) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set. Run pnpm db:start first.");

const admin: SupabaseClient = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// =========================================================
// Test setup helpers
// =========================================================

const createdUserIds: string[] = [];

async function createUserWithCompetitor(
  opts: {
    welcomeReportSent?: boolean;
    competitorName?: string;
    competitorUrl?: string;
  } = {},
): Promise<{ userId: string; email: string }> {
  const email = `wf-${randomUUID()}@inteloop.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "TestPassword123!",
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("user not created");
  const userId = data.user.id;
  createdUserIds.push(userId);

  await admin
    .from("profiles")
    .update({ welcome_report_sent: opts.welcomeReportSent ?? false })
    .eq("id", userId);

  if (opts.competitorName !== undefined) {
    await admin.from("competitors").insert({
      user_id: userId,
      name: opts.competitorName,
      website_url: opts.competitorUrl ?? "https://acme.example",
    });
  }

  return { userId, email };
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

// =========================================================
// Mock adapters
// =========================================================

function mockFirecrawl(): FirecrawlClient {
  const scrapeOk = (): ScrapeResult => ({
    ok: true,
    markdown: Array.from({ length: 300 }, (_, i) => `w${i}`).join(" "),
    wordCount: 300,
    scrapeLimited: false,
  });
  return { scrape: async () => scrapeOk() };
}

function mockBrave(): BraveClient {
  return {
    search: async () => ({
      ok: true,
      results: [
        {
          title: "Acme launches X",
          snippet: "A short summary.",
          url: "https://news.example/acme",
          date: "2026-06-13",
        },
      ],
    }),
  };
}

function mockGenerator(
  override?: GeneratorResult<WelcomeReport>,
  competitorNames: string[] = ["Acme"],
): Generator {
  const success: GeneratorResult<WelcomeReport> = {
    ok: true,
    data: {
      competitors: competitorNames.map((name) => ({
        name,
        snapshot: "Snapshot paragraph with enough words to clear the disclaimer threshold. ".repeat(
          10,
        ),
        news: [],
        website_signals: "Signals.",
        what_to_watch: ["a", "b", "c"],
        scrape_limited: false,
      })),
      closing_line: WELCOME_CLOSING_LINE,
    },
    usage: { input_tokens: 1234, output_tokens: 567 },
    model: "claude-sonnet-4-5",
    attempts: 1,
  };
  const result = override ?? success;
  return {
    welcome: async () => result,
    weekly: async () => {
      throw new Error("weekly() not implemented in mock");
    },
    battlecard: async () => {
      throw new Error("battlecard() not implemented in mock");
    },
    daily: async () => {
      throw new Error("daily() not implemented in mock");
    },
  };
}

function mockResend(result: SendEmailResult = { ok: true, id: "msg_test" }): ResendClient {
  return { send: async () => result };
}

function buildDeps(overrides: Partial<WelcomeWorkflowDeps> = {}): WelcomeWorkflowDeps {
  return {
    supabase: admin,
    firecrawl: overrides.firecrawl ?? mockFirecrawl(),
    brave: overrides.brave ?? mockBrave(),
    generator: overrides.generator ?? mockGenerator(),
    resend: overrides.resend ?? mockResend(),
    fromAddress: "Inteloop <noreply@inteloop.com>",
  };
}

// =========================================================
// Tests
// =========================================================

describe("runWelcomeWorkflow", () => {
  it("happy path: sends email, inserts report, flips welcome_report_sent (PRD §8.4)", async () => {
    const { userId } = await createUserWithCompetitor({ competitorName: "Acme" });

    const result = await runWelcomeWorkflow(userId, buildDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    expect(result.competitorCount).toBe(1);
    expect(result.emailId).toBe("msg_test");

    const { data: profile } = await admin
      .from("profiles")
      .select("welcome_report_sent")
      .eq("id", userId)
      .single();
    expect(profile?.welcome_report_sent).toBe(true);

    const { data: report } = await admin
      .from("reports")
      .select("id, report_type, status, email_subject, delivered_at, content")
      .eq("id", result.reportId)
      .single();
    expect(report?.report_type).toBe("welcome");
    expect(report?.status).toBe("delivered");
    expect(report?.email_subject).toContain("Acme");
    expect(report?.delivered_at).toBeTruthy();
    expect(report?.content).toMatchObject({ closing_line: WELCOME_CLOSING_LINE });

    const { data: links } = await admin
      .from("report_competitors")
      .select("report_id, competitor_id, scrape_limited")
      .eq("report_id", result.reportId);
    expect(links).toHaveLength(1);

    const { data: usage } = await admin
      .from("api_usage")
      .select("provider, status")
      .eq("user_id", userId);
    const providers = (usage ?? []).map((row) => (row as { provider: string }).provider);
    expect(providers).toContain("firecrawl");
    expect(providers).toContain("brave");
    expect(providers).toContain("claude");
    expect(providers).toContain("resend");
  });

  it("PRD §8.4: Resend failure leaves welcome_report_sent false and no reports row", async () => {
    const { userId } = await createUserWithCompetitor({ competitorName: "BetaCo" });

    const result = await runWelcomeWorkflow(
      userId,
      buildDeps({
        resend: mockResend({ ok: false, reason: "outage", status: 503 }),
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("email_failed");

    const { data: profile } = await admin
      .from("profiles")
      .select("welcome_report_sent")
      .eq("id", userId)
      .single();
    expect(profile?.welcome_report_sent).toBe(false);

    const { data: reports } = await admin.from("reports").select("id").eq("user_id", userId);
    expect(reports ?? []).toHaveLength(0);
  });

  it("is a no-op when welcome_report_sent is already true (idempotent)", async () => {
    const { userId } = await createUserWithCompetitor({
      welcomeReportSent: true,
      competitorName: "Idemp",
    });

    let resendCallCount = 0;
    const resendCounter: ResendClient = {
      send: async () => {
        resendCallCount += 1;
        return { ok: true, id: "msg_should_not_send" };
      },
    };

    const result = await runWelcomeWorkflow(userId, buildDeps({ resend: resendCounter }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("already_sent");
    expect(resendCallCount).toBe(0);
  });

  it("returns no_competitors when the user has none", async () => {
    const { userId } = await createUserWithCompetitor();
    const result = await runWelcomeWorkflow(userId, buildDeps());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("no_competitors");
  });

  it("returns claude_failed and does NOT send email when generator fails", async () => {
    const { userId } = await createUserWithCompetitor({ competitorName: "ClaudeDown" });

    let resendCallCount = 0;
    const resendCounter: ResendClient = {
      send: async () => {
        resendCallCount += 1;
        return { ok: true, id: "msg_x" };
      },
    };

    const result = await runWelcomeWorkflow(
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

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("claude_failed");
    expect(resendCallCount).toBe(0);

    const { data: profile } = await admin
      .from("profiles")
      .select("welcome_report_sent")
      .eq("id", userId)
      .single();
    expect(profile?.welcome_report_sent).toBe(false);
  });
});

describe("findUsersPendingWelcomeReport (PRD §8.4)", () => {
  it("returns only users with welcome_report_sent=false AND at least one active competitor", async () => {
    const pending = await createUserWithCompetitor({
      welcomeReportSent: false,
      competitorName: "Pending",
    });
    const sentAlready = await createUserWithCompetitor({
      welcomeReportSent: true,
      competitorName: "Done",
    });
    const noCompetitors = await createUserWithCompetitor({ welcomeReportSent: false });

    const result = await findUsersPendingWelcomeReport(admin, 100);
    expect(result).toContain(pending.userId);
    expect(result).not.toContain(sentAlready.userId);
    expect(result).not.toContain(noCompetitors.userId);
  });
});
