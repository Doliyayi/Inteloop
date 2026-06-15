import { NextResponse, type NextRequest } from "next/server";

import { buildMobileMoneyDeps } from "@/lib/billing/deps";
import { initiateMpesa } from "@/lib/billing/mobileMoney";
import { mpesaInitiateSchema } from "@/lib/billing/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// §10.6: initiate an Mpesa STK Push for the selected plan. The push result is
// async — the /api/webhooks/mpesa callback confirms payment and activates the
// subscription.
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

  const parsed = mpesaInitiateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await initiateMpesa(user.id, parsed.data, buildMobileMoneyDeps());
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
      // §10.11: "Check your phone for the Mpesa prompt."
      message:
        result.customerMessage ||
        "Check your phone for the Mpesa prompt. It may take up to 1 minute to arrive.",
    },
    { status: 202 },
  );
}
