import Link from "next/link";
import { notFound } from "next/navigation";

import { BattlecardView } from "@/components/battlecards/BattlecardView";
import { PrintButton } from "@/components/battlecards/PrintButton";
import { getBattlecard } from "@/lib/battlecards/history";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type Props = { params: { id: string } };

export default async function BattlecardDetailPage({ params }: Props) {
  const supabase = createSupabaseServerClient();
  // RLS scopes this to the owner; a foreign/missing id is a 404.
  const battlecard = await getBattlecard(supabase, params.id);
  if (!battlecard) notFound();

  const name = battlecard.competitor?.name ?? "Competitor";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/dashboard/battlecards" className="link text-sm">
        ← All battlecards
      </Link>

      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-rose-500">
            Battlecard
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">{name}</h1>
          <p className="text-sm text-neutral-500">{formatDate(battlecard.generated_at)}</p>
        </div>
        <PrintButton />
      </header>

      <BattlecardView content={battlecard.content} />
    </div>
  );
}
