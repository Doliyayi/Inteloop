import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ResendClient } from "../integrations/resend";
import {
  cancellationSurveySubject,
  day5TeaserSubject,
  day7ConversionSubject,
  renderCancellationSurveyHtml,
  renderDay5TeaserHtml,
  renderDay7ConversionHtml,
} from "./emails";

// Trial-lifecycle + cancellation email sequences (PRD §18). Driven by n8n
// crons hitting the internal routes. Every send is guarded by the
// lifecycle_emails ledger so a re-run (or overlapping cron) never double-sends.

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
// Don't survey-spam people who cancelled long before this feature shipped.
const SURVEY_MAX_AGE_MS = 7 * DAY_MS;

export type LifecycleType =
  | "day5_teaser"
  | "day7_conversion"
  | "subscription_cancelled"
  | "cancellation_survey";

export type LifecycleDeps = {
  supabase: SupabaseClient; // service role — bypasses RLS
  resend: ResendClient;
  fromAddress: string;
  appUrl: string;
  surveyUrl: string;
};

export type TrialEmailDecision = "day5_teaser" | "day7_conversion" | null;

// Pure: given a trial user's age and what's already been sent, decide which
// (if any) email is due. Day 7 conversion takes precedence once they're a week
// in; the day-5 teaser only makes sense when a report is actually coming
// (i.e. they have competitors).
export function decideTrialEmail(input: {
  ageDays: number;
  day5Sent: boolean;
  day7Sent: boolean;
  hasCompetitors: boolean;
}): TrialEmailDecision {
  if (input.ageDays >= 7) {
    return input.day7Sent ? null : "day7_conversion";
  }
  if (input.ageDays >= 5 && input.hasCompetitors) {
    return input.day5Sent ? null : "day5_teaser";
  }
  return null;
}

// Atomically claim a (user, type) send. Returns false if already claimed
// (unique violation), true if this caller owns the send.
async function claim(deps: LifecycleDeps, userId: string, type: LifecycleType): Promise<boolean> {
  const { error } = await deps.supabase
    .from("lifecycle_emails")
    .insert({ user_id: userId, email_type: type });
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false;
  throw new Error(`lifecycle claim failed: ${error.message}`);
}

// Release a claim so a later run can retry after a send failure.
async function release(deps: LifecycleDeps, userId: string, type: LifecycleType): Promise<void> {
  await deps.supabase
    .from("lifecycle_emails")
    .delete()
    .eq("user_id", userId)
    .eq("email_type", type);
}

export type BatchSummary = { candidates: number; sent: number; skipped: number; failed: number };

type TrialCandidate = {
  id: string;
  email: string;
  trial_started_at: string | null;
  competitors: { name: string; is_active: boolean }[] | null;
};

// =========================================================
// Day 5 teaser + Day 7 conversion (daily cron)
// =========================================================

export async function runTrialEmailBatch(
  deps: LifecycleDeps,
  now: number = Date.now(),
): Promise<BatchSummary> {
  const fiveDaysAgo = new Date(now - 5 * DAY_MS).toISOString();
  const { data, error } = await deps.supabase
    .from("profiles")
    .select("id, email, trial_started_at, competitors(name, is_active)")
    .eq("plan", "trial")
    .lte("trial_started_at", fiveDaysAgo);
  if (error) throw new Error(`runTrialEmailBatch query failed: ${error.message}`);

  const candidates = (data ?? []) as TrialCandidate[];
  if (candidates.length === 0) return { candidates: 0, sent: 0, skipped: 0, failed: 0 };

  // Pull existing day5/day7 ledger rows for these users in one query.
  const ids = candidates.map((c) => c.id);
  const { data: ledger } = await deps.supabase
    .from("lifecycle_emails")
    .select("user_id, email_type")
    .in("user_id", ids)
    .in("email_type", ["day5_teaser", "day7_conversion"]);
  const sentSet = new Set(
    ((ledger ?? []) as { user_id: string; email_type: string }[]).map(
      (r) => `${r.user_id}:${r.email_type}`,
    ),
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of candidates) {
    if (!c.trial_started_at) {
      skipped += 1;
      continue;
    }
    const ageDays = (now - new Date(c.trial_started_at).getTime()) / DAY_MS;
    const activeNames = (c.competitors ?? []).filter((x) => x.is_active).map((x) => x.name);
    const decision = decideTrialEmail({
      ageDays,
      day5Sent: sentSet.has(`${c.id}:day5_teaser`),
      day7Sent: sentSet.has(`${c.id}:day7_conversion`),
      hasCompetitors: activeNames.length > 0,
    });
    if (!decision) {
      skipped += 1;
      continue;
    }

    try {
      if (!(await claim(deps, c.id, decision))) {
        skipped += 1;
        continue;
      }
      const result =
        decision === "day5_teaser"
          ? await deps.resend.send({
              from: deps.fromAddress,
              to: c.email,
              subject: day5TeaserSubject(),
              html: renderDay5TeaserHtml({
                competitorNames: activeNames,
                dashboardUrl: `${deps.appUrl}/dashboard/competitors`,
              }),
            })
          : await deps.resend.send({
              from: deps.fromAddress,
              to: c.email,
              subject: day7ConversionSubject(),
              html: renderDay7ConversionHtml({
                subscribeUrl: `${deps.appUrl}/dashboard/settings`,
              }),
            });
      if (result.ok) {
        sent += 1;
      } else {
        await release(deps, c.id, decision);
        failed += 1;
      }
    } catch {
      await release(deps, c.id, decision);
      failed += 1;
    }
  }

  return { candidates: candidates.length, sent, skipped, failed };
}

// =========================================================
// Cancellation survey (hourly cron) — §18: 1 hour after cancellation
// =========================================================

type CancelCandidate = { id: string; email: string; cancelled_at: string | null };

export async function runCancellationSurveyBatch(
  deps: LifecycleDeps,
  now: number = Date.now(),
): Promise<BatchSummary> {
  const oneHourAgo = new Date(now - HOUR_MS).toISOString();
  const windowStart = new Date(now - SURVEY_MAX_AGE_MS).toISOString();
  const { data, error } = await deps.supabase
    .from("profiles")
    .select("id, email, cancelled_at")
    .eq("plan", "cancelled")
    .lte("cancelled_at", oneHourAgo)
    .gte("cancelled_at", windowStart);
  if (error) throw new Error(`runCancellationSurveyBatch query failed: ${error.message}`);

  const candidates = (data ?? []) as CancelCandidate[];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of candidates) {
    try {
      if (!(await claim(deps, c.id, "cancellation_survey"))) {
        skipped += 1;
        continue;
      }
      const result = await deps.resend.send({
        from: deps.fromAddress,
        to: c.email,
        subject: cancellationSurveySubject(),
        html: renderCancellationSurveyHtml({ surveyUrl: deps.surveyUrl }),
      });
      if (result.ok) {
        sent += 1;
      } else {
        await release(deps, c.id, "cancellation_survey");
        failed += 1;
      }
    } catch {
      await release(deps, c.id, "cancellation_survey");
      failed += 1;
    }
  }

  return { candidates: candidates.length, sent, skipped, failed };
}
