import Link from "next/link";

import { hasCapability } from "@/lib/billing/capabilities";
import { CustomDomainSettings } from "@/components/integrations/CustomDomainSettings";
import { SlackIntegration } from "@/components/integrations/SlackIntegration";
import { WhiteLabelSettings } from "@/components/integrations/WhiteLabelSettings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Integrations — Inteloop" };

type ProfileRow = {
  plan: string;
  slack_webhook_url: string | null;
  white_label_enabled: boolean;
  white_label_sender_name: string | null;
  white_label_logo_url: string | null;
  white_label_footer_text: string | null;
  white_label_domain: string | null;
  white_label_domain_verified: boolean;
};

export default async function IntegrationsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The dashboard layout guards auth; user is non-null here.

  const { data } = await supabase
    .from("profiles")
    .select(
      "plan, slack_webhook_url, white_label_enabled, white_label_sender_name, white_label_logo_url, white_label_footer_text, white_label_domain, white_label_domain_verified",
    )
    .eq("id", user!.id)
    .maybeSingle();
  const profile = data as ProfileRow | null;
  const canWhiteLabel = hasCapability(profile?.plan, "whiteLabel");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Integrations</h1>

      <SlackIntegration savedUrl={profile?.slack_webhook_url ?? ""} />

      {canWhiteLabel ? (
        <>
          <WhiteLabelSettings
            initial={{
              enabled: profile?.white_label_enabled ?? false,
              senderName: profile?.white_label_sender_name ?? "",
              logoUrl: profile?.white_label_logo_url ?? "",
              footerText: profile?.white_label_footer_text ?? "",
            }}
          />
          <CustomDomainSettings
            initialDomain={profile?.white_label_domain ?? null}
            initialVerified={profile?.white_label_domain_verified ?? false}
          />
        </>
      ) : (
        <div className="card space-y-3">
          <h2 className="text-base font-semibold text-neutral-950">White-label reports</h2>
          <p className="text-sm text-neutral-500">
            Replace Inteloop branding with your own logo, sender name, and footer. Available on the
            Growth and Pro plans.
          </p>
          <Link href="/dashboard/billing" className="btn-primary w-fit">
            Upgrade to Growth
          </Link>
        </div>
      )}
    </div>
  );
}
