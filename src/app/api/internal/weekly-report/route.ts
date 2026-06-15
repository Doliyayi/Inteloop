import { NextResponse, type NextRequest } from "next/server";

import { buildWeeklyWorkflowDeps } from "@/lib/reports/weeklyDeps";
import { runWeeklyReport } from "@/lib/reports/weeklyWorkflow";

// Long Claude generations + multiple upstream calls can exceed Vercel's
// default. Single-subscriber weekly run, invoked by n8n's per-subscriber loop.
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const userId = (body as { user_id?: unknown } | null)?.user_id;
  if (typeof userId !== "string" || userId.length === 0) {
    return NextResponse.json({ error: "user_id is required." }, { status: 400 });
  }

  let result;
  try {
    result = await runWeeklyReport(userId, buildWeeklyWorkflowDeps());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }

  if (result.ok) return NextResponse.json(result, { status: 200 });

  // No-op outcomes return 200 so n8n doesn't retry; real failures return 5xx.
  const noOpReasons = new Set(["not_subscribed", "no_competitors"]);
  const status =
    result.reason === "user_not_found" ? 404 : noOpReasons.has(result.reason) ? 200 : 502;
  return NextResponse.json(result, { status });
}
