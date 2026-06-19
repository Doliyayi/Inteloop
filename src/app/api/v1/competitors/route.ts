import { NextResponse } from "next/server";

import { apiContext } from "@/lib/apikeys/context";
import { checkCanAddCompetitor } from "@/lib/competitors/limits";
import { competitorCreateSchema } from "@/lib/competitors/schemas";

const COLUMNS = "id, name, website_url, notes, is_active, created_at, updated_at";

// GET /v1/competitors — list active tracked competitors (§15.2).
export async function GET(request: Request) {
  const ctx = await apiContext(request);
  if (!ctx.ok) return ctx.response;

  const { data, error } = await ctx.supabase
    .from("competitors")
    .select(COLUMNS)
    .eq("user_id", ctx.userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /v1/competitors — add a competitor (§15.2), enforcing the plan limit.
export async function POST(request: Request) {
  const ctx = await apiContext(request);
  if (!ctx.ok) return ctx.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = competitorCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const gate = await checkCanAddCompetitor(ctx.supabase, ctx.userId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data, error } = await ctx.supabase
    .from("competitors")
    .insert({ user_id: ctx.userId, ...parsed.data })
    .select(COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
