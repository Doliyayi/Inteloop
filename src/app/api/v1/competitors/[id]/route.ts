import { NextResponse } from "next/server";

import { apiContext } from "@/lib/apikeys/context";
import { competitorUpdateSchema } from "@/lib/competitors/schemas";

const COLUMNS = "id, name, website_url, notes, is_active, created_at, updated_at";

// PUT /v1/competitors/{id} — update a competitor (§15.2).
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const ctx = await apiContext(request);
  if (!ctx.ok) return ctx.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = competitorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const { data, error } = await ctx.supabase
    .from("competitors")
    .update(parsed.data)
    .eq("id", params.id)
    .eq("user_id", ctx.userId)
    .eq("is_active", true)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data });
}

// DELETE /v1/competitors/{id} — soft-delete (set is_active=false), matching the
// dashboard route's behaviour (§15.2).
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const ctx = await apiContext(request);
  if (!ctx.ok) return ctx.response;

  const { data, error } = await ctx.supabase
    .from("competitors")
    .update({ is_active: false })
    .eq("id", params.id)
    .eq("user_id", ctx.userId)
    .eq("is_active", true)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: { id: params.id, removed: true } });
}
