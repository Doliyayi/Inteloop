import { NextResponse } from "next/server";

import { apiContext } from "@/lib/apikeys/context";

// GET /v1/battlecards/{competitor_id} — the latest battlecard for a competitor
// (§15.2). Scoped to the key owner.
export async function GET(request: Request, { params }: { params: { competitorId: string } }) {
  const ctx = await apiContext(request);
  if (!ctx.ok) return ctx.response;

  const { data, error } = await ctx.supabase
    .from("battlecards")
    .select("id, competitor_id, content, generated_at")
    .eq("user_id", ctx.userId)
    .eq("competitor_id", params.competitorId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json(
      { error: "No battlecard found for this competitor." },
      { status: 404 },
    );
  return NextResponse.json({ data });
}
