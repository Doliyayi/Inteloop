import { NextResponse, type NextRequest } from "next/server";

import { checkCanAddCompetitor } from "@/lib/competitors/limits";
import { competitorCreateSchema } from "@/lib/competitors/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SELECT_COLUMNS = "id, name, website_url, notes, is_active, created_at, updated_at";

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("competitors")
    .select(SELECT_COLUMNS)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

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

  const parsed = competitorCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const gate = await checkCanAddCompetitor(supabase, user.id);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { data, error } = await supabase
    .from("competitors")
    .insert({ user_id: user.id, ...parsed.data })
    .select(SELECT_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
