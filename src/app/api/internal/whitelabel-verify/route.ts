import { NextResponse, type NextRequest } from "next/server";

import { findUsersPendingDomainVerification, refreshDomainStatus } from "@/lib/whitelabel/domain";
import { adminDomainDeps } from "@/lib/whitelabel/domainDeps";

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

// §13.3 step 5: poll Resend for pending domains (registered within 24h) and
// flip them to verified when ready. Runs every ~15 minutes via n8n.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let deps;
  try {
    deps = adminDomainDeps();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }

  const userIds = await findUsersPendingDomainVerification(deps.supabase);
  let verified = 0;
  let pending = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const result = await refreshDomainStatus(deps, userId, { triggerVerify: true });
      if (result.ok && result.verified) verified += 1;
      else if (result.ok) pending += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json(
    { candidates: userIds.length, verified, pending, failed },
    { status: 200 },
  );
}
