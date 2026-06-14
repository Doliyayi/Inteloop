import { NextResponse, type NextRequest } from "next/server";

import { buildWelcomeWorkflowDeps } from "@/lib/reports/welcomeDeps";
import {
  findUsersPendingWelcomeReport,
  runWelcomeWorkflow,
  type WelcomeWorkflowResult,
} from "@/lib/reports/welcomeWorkflow";

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

// PRD §8.4: hourly cron. Processes up to N pending users sequentially so a
// single bad subscriber can't blow up the batch.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let deps;
  try {
    deps = buildWelcomeWorkflowDeps();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }

  const userIds = await findUsersPendingWelcomeReport(deps.supabase);
  const results: Array<{
    user_id: string;
    result: WelcomeWorkflowResult | { ok: false; reason: "exception"; detail: string };
  }> = [];

  for (const userId of userIds) {
    try {
      const result = await runWelcomeWorkflow(userId, deps);
      results.push({ user_id: userId, result });
    } catch (err) {
      results.push({
        user_id: userId,
        result: {
          ok: false,
          reason: "exception",
          detail: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  const summary = {
    candidates: userIds.length,
    delivered: results.filter((r) => r.result.ok).length,
    skipped: results.filter(
      (r) =>
        !r.result.ok &&
        (r.result.reason === "already_sent" || r.result.reason === "no_competitors"),
    ).length,
    failed: results.filter(
      (r) =>
        !r.result.ok && r.result.reason !== "already_sent" && r.result.reason !== "no_competitors",
    ).length,
    results,
  };

  return NextResponse.json(summary, { status: 200 });
}
