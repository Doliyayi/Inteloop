import { NextResponse, type NextRequest } from "next/server";

import { parseIpList, verifyCallbackAuth } from "@/lib/billing/callbackAuth";
import { buildMobileMoneyDeps } from "@/lib/billing/deps";
import { processKcbCallback } from "@/lib/billing/mobileMoney";
import { parseKcbCallback } from "@/lib/billing/schemas";

export const runtime = "nodejs";

// Lipa na KCB payment callback (§10.9). UNVERIFIED payload shape — see
// integrations/kcb.ts. Validated against KCB_CALLBACK_SECRET (?token=) and/or
// an IP allowlist.
export async function POST(request: NextRequest) {
  const authorized = verifyCallbackAuth(request, {
    secret: process.env.KCB_CALLBACK_SECRET,
    allowedIps: parseIpList(process.env.KCB_CALLBACK_IPS),
  });
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const cb = parseKcbCallback(body);
  if (!cb) {
    return NextResponse.json({ received: true, status: "ignored_malformed" }, { status: 200 });
  }

  try {
    const result = await processKcbCallback(cb, buildMobileMoneyDeps());
    return NextResponse.json({ received: true, status: result.status }, { status: 200 });
  } catch (err) {
    console.error("[kcb] callback processing failed:", err);
    return NextResponse.json({ received: true, status: "deferred" }, { status: 200 });
  }
}
