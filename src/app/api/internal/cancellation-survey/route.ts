import { NextResponse, type NextRequest } from "next/server";

import { buildLifecycleDeps } from "@/lib/lifecycle/deps";
import { runCancellationSurveyBatch } from "@/lib/lifecycle/workflow";

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

// §18 cancellation survey — sent ~1 hour after cancellation. Hourly cron,
// idempotent via the lifecycle_emails ledger.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runCancellationSurveyBatch(buildLifecycleDeps());
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }
}
