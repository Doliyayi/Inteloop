import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildBattlecardDeps } from "@/lib/battlecards/deps";
import { generateBattlecard } from "@/lib/battlecards/workflow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Long Claude + scrape calls can exceed the default budget.
export const maxDuration = 300;

const bodySchema = z.object({ competitor_id: z.string().uuid("Invalid competitor.") });

// POST /api/battlecards — generate a battlecard on demand (§14). Pro-gated and
// ownership-checked inside generateBattlecard.
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  const plan = (profile as { plan: string } | null)?.plan ?? "trial";

  let result;
  try {
    result = await generateBattlecard(
      user.id,
      parsed.data.competitor_id,
      plan,
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
