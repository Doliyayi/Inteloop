import { SlackIntegration } from "@/components/integrations/SlackIntegration";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Integrations — Inteloop" };

export default async function IntegrationsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The dashboard layout guards auth; user is non-null here.

  const { data } = await supabase
    .from("profiles")
    .select("slack_webhook_url")
    .eq("id", user!.id)
    .maybeSingle();
  const savedUrl = (data as { slack_webhook_url: string | null } | null)?.slack_webhook_url ?? "";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Integrations</h1>
      <SlackIntegration savedUrl={savedUrl} />
    </div>
  );
}
