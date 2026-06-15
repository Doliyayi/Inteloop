import { NextResponse, type NextRequest } from "next/server";

import { getReport } from "@/lib/reports/history";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET /api/reports/[id] — a single report including its content (§17).
// RLS scopes visibility to the owner; a missing or foreign id is a 404.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const report = await getReport(supabase, params.id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }
}
