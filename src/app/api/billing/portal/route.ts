import { NextResponse } from "next/server";

import { stripeBilling } from "@/lib/billing/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// §10.5 / §10.11: the Customer Portal is reachable from the dashboard without
// a support request. It handles upgrade/downgrade, cancellation, invoices, and
// payment-method updates.
export async function POST() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  const customerId = (profile as { stripe_customer_id: string | null } | null)?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer on file. Subscribe first." },
      { status: 400 },
    );
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const result = await stripeBilling().createPortalSession(
    customerId,
    `${appUrl}/dashboard/settings`,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ url: result.url });
}
