import { NextResponse, type NextRequest } from "next/server";

import { buildLifecycleDeps } from "@/lib/lifecycle/deps";
import { runTrialEmailBatch } from "@/lib/lifecycle/workflow";

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

// §18 day-5 teaser + day-7 conversion. Daily cron. Idempotent via the
// lifecycle_emails ledger, so the exact run time and re-runs are safe.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runTrialEmailBatch(buildLifecycleDeps());
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }
}
