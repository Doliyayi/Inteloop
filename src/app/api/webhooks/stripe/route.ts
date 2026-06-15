import { NextResponse, type NextRequest } from "next/server";

import { buildStripeWebhookDeps } from "@/lib/billing/deps";
import { stripeBilling } from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/webhook";

// Signature verification requires the raw request body, so this route reads
// request.text() and must not run on the edge runtime.
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  const payload = await request.text();

  let billing;
  try {
    billing = stripeBilling();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "config error" },
      { status: 500 },
    );
  }

  // §21.5 / CLAUDE.md: verify the signature before any state change.
  const parsed = billing.constructWebhookEvent(payload, signature);
  if (!parsed.ok) {
    return NextResponse.json({ error: `Invalid signature: ${parsed.error}` }, { status: 400 });
  }

  const result = await handleStripeEvent(parsed.event, buildStripeWebhookDeps());
  // Return 5xx on genuine processing failure so Stripe retries; 200 for
  // processed/duplicate/ignored so it stops.
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ received: true, status: result.status });
}
