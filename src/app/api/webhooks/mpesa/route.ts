import { NextResponse, type NextRequest } from "next/server";

import { parseIpList, verifyCallbackAuth } from "@/lib/billing/callbackAuth";
import { buildMobileMoneyDeps } from "@/lib/billing/deps";
import { processMpesaCallback } from "@/lib/billing/mobileMoney";
import { parseMpesaCallback } from "@/lib/billing/schemas";

export const runtime = "nodejs";

// Daraja STK Push result callback (§10.9). Validated against a shared secret
// (?token=) and/or an IP allowlist. We acknowledge with 200 once processed so
// Safaricom does not retry a successfully-received callback.
export async function POST(request: NextRequest) {
  const authorized = verifyCallbackAuth(request, {
    secret: process.env.MPESA_CALLBACK_SECRET,
    allowedIps: parseIpList(process.env.MPESA_CALLBACK_IPS),
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

  const cb = parseMpesaCallback(body);
  if (!cb) {
    // Malformed payload — ack so Safaricom stops retrying; nothing to act on.
    return NextResponse.json({ received: true, status: "ignored_malformed" }, { status: 200 });
  }

  try {
    const result = await processMpesaCallback(cb, buildMobileMoneyDeps());
    return NextResponse.json({ received: true, status: result.status }, { status: 200 });
  } catch (err) {
    // Log and still 200: the payment row remains 'pending' and the renewal /
    // reconciliation cron can recover it. Returning 5xx would invite retries
    // that race the same row.
    console.error("[mpesa] callback processing failed:", err);
    return NextResponse.json({ received: true, status: "deferred" }, { status: 200 });
  }
}
