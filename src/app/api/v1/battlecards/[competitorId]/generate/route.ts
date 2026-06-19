import { NextResponse } from "next/server";

import { apiContext } from "@/lib/apikeys/context";
import { buildBattlecardDeps } from "@/lib/battlecards/deps";
import { generateBattlecard } from "@/lib/battlecards/workflow";

export const maxDuration = 300;

// POST /v1/battlecards/{competitor_id}/generate — on-demand generation (§15.2).
// Pro + ownership are enforced inside generateBattlecard.
export async function POST(request: Request, { params }: { params: { competitorId: string } }) {
  const ctx = await apiContext(request);
  if (!ctx.ok) return ctx.response;

  let result;
  try {
    result = await generateBattlecard(
      ctx.userId,
      params.competitorId,
      ctx.plan,
      buildBattlecardDeps(),
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: { id: result.battlecardId } }, { status: 201 });
}
