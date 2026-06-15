import { NextResponse, type NextRequest } from "next/server";

import { buildMobileMoneyDeps } from "@/lib/billing/deps";
import { initiateKcb } from "@/lib/billing/mobileMoney";
import { kcbInitiateSchema } from "@/lib/billing/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// §10.7: initiate a Lipa na KCB payment. Confirmation arrives via
// /api/webhooks/kcb. NOTE: the KCB adapter is unverified (see
// integrations/kcb.ts) and must be validated against KCB's sandbox.
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = kcbInitiateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await initiateKcb(user.id, parsed.data, buildMobileMoneyDeps());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(
    {
      paymentId: result.paymentId,
      reference: result.reference,
      message: "Authorise the payment in your KCB app or via USSD.",
    },
    { status: 202 },
  );
}
