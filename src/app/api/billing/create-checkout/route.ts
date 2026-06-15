import { NextResponse, type NextRequest } from "next/server";

import { checkoutRequestSchema } from "@/lib/billing/schemas";
import { stripePriceId } from "@/lib/billing/plans";
import { stripeBilling } from "@/lib/billing/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TRIAL_DAYS = 8; // §10.3: trial_end is 8 days from signup.

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

  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const { plan, interval } = parsed.data;

  const priceId = stripePriceId(plan, interval);
  if (!priceId) {
    return NextResponse.json({ error: "Plan pricing is not configured." }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, stripe_customer_id, trial_started_at")
    .eq("id", user.id)
    .maybeSingle();
  const typedProfile = profile as {
    email: string;
    stripe_customer_id: string | null;
    trial_started_at: string | null;
  } | null;

  // Keep the trial running until day 8 from signup; the first charge lands then.
  let trialEnd: number | undefined;
  if (typedProfile?.trial_started_at) {
    const end = new Date(typedProfile.trial_started_at).getTime() + TRIAL_DAYS * 86_400_000;
    if (end > Date.now()) trialEnd = Math.floor(end / 1000);
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const result = await stripeBilling().createCheckoutSession({
    priceId,
    plan,
    interval,
    userId: user.id,
    successUrl: `${appUrl}/dashboard?checkout=success`,
    cancelUrl: `${appUrl}/dashboard/settings?checkout=cancelled`,
    ...(typedProfile?.stripe_customer_id
      ? { customerId: typedProfile.stripe_customer_id }
      : typedProfile?.email
        ? { customerEmail: typedProfile.email }
        : {}),
    ...(trialEnd ? { trialEnd } : {}),
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ url: result.url });
}
