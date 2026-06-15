import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import type { ResendClient } from "@/lib/integrations/resend";
import {
  runCancellationSurveyBatch,
  runTrialEmailBatch,
  type LifecycleDeps,
} from "@/lib/lifecycle/workflow";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SERVICE) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set. Run pnpm db:start first.");

const admin: SupabaseClient = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdUserIds: string[] = [];
let sent: { to: string | string[]; subject: string }[] = [];

const recordingResend: ResendClient = {
  async send(input) {
    sent.push({ to: input.to, subject: input.subject });
    return { ok: true, id: `mock-${sent.length}` };
  },
};

function deps(): LifecycleDeps {
  return {
    supabase: admin,
    resend: recordingResend,
    fromAddress: "Inteloop <noreply@inteloop.test>",
    appUrl: "https://app.inteloop.test",
    surveyUrl: "https://survey.example/cancel",
  };
}

const DAY = 86_400_000;

async function makeUser(opts: {
  plan: string;
  trialDaysAgo?: number;
  cancelledMinsAgo?: number;
  competitor?: boolean;
}): Promise<{ id: string; email: string }> {
  const email = `lifecycle-${randomUUID()}@inteloop.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "Lifecycle-1!",
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("user not created");
  const id = data.user.id;
  createdUserIds.push(id);

  const patch: Record<string, unknown> = { plan: opts.plan };
  if (opts.trialDaysAgo !== undefined) {
    patch.trial_started_at = new Date(Date.now() - opts.trialDaysAgo * DAY).toISOString();
  }
  if (opts.cancelledMinsAgo !== undefined) {
    patch.cancelled_at = new Date(Date.now() - opts.cancelledMinsAgo * 60_000).toISOString();
  }
  await admin.from("profiles").update(patch).eq("id", id);

  if (opts.competitor) {
    await admin
      .from("competitors")
      .insert({ user_id: id, name: "Acme", website_url: "https://acme.example" });
  }
  return { id, email };
}

function subjectsFor(email: string): string[] {
  return sent.filter((e) => e.to === email).map((e) => e.subject);
}

afterAll(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

beforeEach(() => {
  sent = [];
});

describe("runTrialEmailBatch (PRD §18)", () => {
  it("sends the day-5 teaser to a 5-day trial user with competitors, once", async () => {
    const u = await makeUser({ plan: "trial", trialDaysAgo: 5, competitor: true });

    const first = await runTrialEmailBatch(deps());
    expect(first.sent).toBeGreaterThanOrEqual(1);
    expect(subjectsFor(u.email)).toEqual(["Your first full report runs tomorrow at 6 AM"]);

    // Idempotent: a second run does not resend.
    sent = [];
    await runTrialEmailBatch(deps());
    expect(subjectsFor(u.email)).toEqual([]);

    const { count } = await admin
      .from("lifecycle_emails")
      .select("*", { count: "exact", head: true })
      .eq("user_id", u.id)
      .eq("email_type", "day5_teaser");
    expect(count).toBe(1);
  });

  it("sends the day-7 conversion to a 7-day trial user", async () => {
    const u = await makeUser({ plan: "trial", trialDaysAgo: 7, competitor: true });
    await runTrialEmailBatch(deps());
    expect(subjectsFor(u.email)).toEqual([
      "How was your first report? Subscribe to keep these coming.",
    ]);
  });

  it("does not email subscribed users", async () => {
    const u = await makeUser({ plan: "starter", trialDaysAgo: 7, competitor: true });
    await runTrialEmailBatch(deps());
    expect(subjectsFor(u.email)).toEqual([]);
  });

  it("skips the day-5 teaser for a trial user with no competitors", async () => {
    const u = await makeUser({ plan: "trial", trialDaysAgo: 5, competitor: false });
    await runTrialEmailBatch(deps());
    expect(subjectsFor(u.email)).toEqual([]);
  });
});

describe("runCancellationSurveyBatch (PRD §18)", () => {
  it("surveys a user cancelled over an hour ago, once", async () => {
    const u = await makeUser({ plan: "cancelled", cancelledMinsAgo: 120 });

    await runCancellationSurveyBatch(deps());
    expect(subjectsFor(u.email)).toEqual(["Quick question — why did you cancel?"]);

    sent = [];
    await runCancellationSurveyBatch(deps());
    expect(subjectsFor(u.email)).toEqual([]);
  });

  it("does not survey a user cancelled less than an hour ago", async () => {
    const u = await makeUser({ plan: "cancelled", cancelledMinsAgo: 10 });
    await runCancellationSurveyBatch(deps());
    expect(subjectsFor(u.email)).toEqual([]);
  });
});
