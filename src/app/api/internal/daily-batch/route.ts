import { NextResponse, type NextRequest } from "next/server";

import { buildDailyWorkflowDeps } from "@/lib/reports/dailyDeps";
import {
  findProSubscribers,
  runDailyBriefing,
  type DailyWorkflowResult,
} from "@/lib/reports/dailyWorkflow";

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

const NO_OP_REASONS = new Set(["not_pro", "no_competitors"]);

// Daily briefing batch — PRD §9.4. Pro subscribers only, Mon–Fri 07:00 UTC.
// Per §9.3 step 3 pattern, individual failures are logged and the batch continues.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let deps;
  try {
    deps = buildDailyWorkflowDeps();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }

  const userIds = await findProSubscribers(deps.supabase);

  let delivered = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    let result: DailyWorkflowResult;
    try {
      result = await runDailyBriefing(userId, deps);
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
    await deps.supabase.from("report_errors").insert({
      user_id: userId,
      report_type: "daily",
      error_message: result.reason,
      error_detail: { detail: result.detail ?? null },
    });
  }

  return NextResponse.json(
    { candidates: userIds.length, delivered, skipped, failed },
    { status: 200 },
  );
}
