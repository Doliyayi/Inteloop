import { NextResponse, type NextRequest } from "next/server";

import { buildWeeklyWorkflowDeps } from "@/lib/reports/weeklyDeps";
import {
  findActiveSubscribers,
  findSubscribersMissingRecentReport,
  runWeeklyReport,
  type WeeklyWorkflowResult,
} from "@/lib/reports/weeklyWorkflow";

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

// A no-op outcome (not subscribed / no competitors) is not an error worth
// logging to report_errors.
const NO_OP_REASONS = new Set(["not_subscribed", "no_competitors"]);

// Weekly report batch (PRD §9.3 step 1 / §21.6 recovery).
//   mode 'weekly'   (default) — every active subscriber. Monday 06:00 cron.
//   mode 'recovery'           — active subscribers with no weekly report in 8
//                               days. The 09:00 recovery cron after a missed run.
//
// Per §9.3 step 3, an individual subscriber's failure is logged to
// report_errors and the batch continues — it never fails the whole run.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let mode: "weekly" | "recovery" = "weekly";
  try {
    const body = (await request.json()) as { mode?: unknown } | null;
    if (body?.mode === "recovery") mode = "recovery";
  } catch {
    // No body → default weekly mode.
  }

  let deps;
  try {
    deps = buildWeeklyWorkflowDeps();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }

  const userIds =
    mode === "recovery"
      ? await findSubscribersMissingRecentReport(deps.supabase)
      : await findActiveSubscribers(deps.supabase);

  let delivered = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    let result: WeeklyWorkflowResult;
    try {
      result = await runWeeklyReport(userId, deps);
    } catch (err) {
      result = {
        ok: false,
        reason: "claude_failed",
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    if (result.ok) {
      delivered += 1;
      continue;
    }
    if (NO_OP_REASONS.has(result.reason)) {
      skipped += 1;
      continue;
    }

    failed += 1;
    // §9.3 step 3: log and continue.
    await deps.supabase.from("report_errors").insert({
      user_id: userId,
      report_type: "weekly",
      error_message: result.reason,
      error_detail: { detail: result.detail ?? null, mode },
    });
  }

  return NextResponse.json(
    { mode, candidates: userIds.length, delivered, skipped, failed },
    { status: 200 },
  );
}
