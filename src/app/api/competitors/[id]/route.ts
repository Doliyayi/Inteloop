import { NextResponse, type NextRequest } from "next/server";

import { competitorUpdateSchema } from "@/lib/competitors/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = { params: { id: string } };

const SELECT_COLUMNS = "id, name, website_url, notes, is_active, created_at, updated_at";

export async function PUT(request: NextRequest, { params }: Context) {
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

  const parsed = competitorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  // RLS limits this update to rows owned by auth.uid(); a non-owner sees 0 rows.
  const { data, error } = await supabase
    .from("competitors")
    .update(parsed.data)
    .eq("id", params.id)
    .eq("is_active", true)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Competitor not found." }, { status: 404 });

  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Soft-delete per PRD §17. report_competitors entries are preserved so
  // historical reports remain queryable (PRD §7.4).
  const { data, error } = await supabase
    .from("competitors")
    .update({ is_active: false })
    .eq("id", params.id)
    .eq("is_active", true)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Competitor not found." }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
