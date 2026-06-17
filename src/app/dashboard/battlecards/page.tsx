import Link from "next/link";

import { BattlecardGenerator } from "@/components/battlecards/BattlecardGenerator";
import { hasCapability } from "@/lib/billing/capabilities";
import { listBattlecards } from "@/lib/battlecards/history";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Battlecards — Inteloop" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function BattlecardsPage() {
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

  if (!hasCapability(plan, "battlecards")) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Battlecards</h1>
        <div className="card space-y-3">
          <p className="text-sm text-neutral-500">
            Generate sales-ready competitive battlecards for any tracked competitor. Available on
            the Pro plan.
          </p>
          <Link href="/dashboard/billing" className="btn-primary w-fit">
            Upgrade to Pro
          </Link>
        </div>
      </div>
    );
  }

  const [competitorsResult, battlecards] = await Promise.all([
    supabase
      .from("competitors")
      .select("id, name")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    listBattlecards(supabase),
  ]);
  const competitors = (competitorsResult.data ?? []) as { id: string; name: string }[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Battlecards</h1>

      <BattlecardGenerator competitors={competitors} />

      {battlecards.length > 0 ? (
        <ul className="space-y-3">
          {battlecards.map((b) => (
            <li key={b.id}>
              <Link
                href={`/dashboard/battlecards/${b.id}`}
                className="card flex items-center justify-between gap-4 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-rose-500/10"
              >
                <div>
                  <p className="font-medium text-neutral-950">
                    {b.competitor?.name ?? "Competitor"}
                  </p>
                  <p className="mt-0.5 text-sm text-neutral-500">{formatDate(b.generated_at)}</p>
                </div>
                <span aria-hidden className="text-neutral-300">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
