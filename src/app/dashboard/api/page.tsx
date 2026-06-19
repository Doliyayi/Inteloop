import Link from "next/link";

import { ApiKeysManager } from "@/components/apikeys/ApiKeysManager";
import { listApiKeys } from "@/lib/apikeys/manage";
import { hasCapability } from "@/lib/billing/capabilities";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "API access — Inteloop" };

export default async function ApiPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user!.id)
    .maybeSingle();
  const plan = (profile as { plan: string } | null)?.plan ?? "trial";

  if (!hasCapability(plan, "apiAccess")) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">API access</h1>
        <div className="card space-y-3">
          <p className="text-sm text-neutral-500">
            Retrieve reports and manage competitors programmatically via the Inteloop API. Available
            on the Pro plan.
          </p>
          <Link href="/dashboard/billing" className="btn-primary w-fit">
            Upgrade to Pro
          </Link>
        </div>
      </div>
    );
  }

  const keys = await listApiKeys(supabase, user!.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">API access</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Base URL{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
            https://api.inteloop.com/v1
          </code>{" "}
          · authenticate with{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
            Authorization: Bearer &lt;key&gt;
          </code>
        </p>
      </div>
      <ApiKeysManager initial={keys} />
    </div>
  );
}
