import { BillingPanel } from "@/components/billing/BillingPanel";
import {
  billingViewState,
  defaultChannel,
  planCards,
  type BillingProfile,
} from "@/lib/billing/view";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Billing — Inteloop" };

export default async function BillingPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The dashboard layout guards auth; user is non-null here.

  const { data } = await supabase
    .from("profiles")
    .select("plan, currency, stripe_current_period_end, subscription_renewal_date")
    .eq("id", user!.id)
    .maybeSingle();

  const row = data as (BillingProfile & { currency: string | null }) | null;
  const profile: BillingProfile = row ?? {
    plan: "trial",
    stripe_current_period_end: null,
    subscription_renewal_date: null,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Billing</h1>
      <BillingPanel
        view={billingViewState(profile)}
        plans={planCards()}
        initialChannel={defaultChannel(row?.currency)}
      />
    </div>
  );
}
