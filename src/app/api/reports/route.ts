import { NextResponse, type NextRequest } from "next/server";

import { listReports } from "@/lib/reports/history";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET /api/reports — paginated list of the signed-in user's reports (§17).
// RLS restricts rows to the caller; ?page= selects the page.
export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pageParam = Number(request.nextUrl.searchParams.get("page"));
  const pageSizeParam = Number(request.nextUrl.searchParams.get("pageSize"));

  try {
    const result = await listReports(supabase, {
      page: Number.isFinite(pageParam) ? pageParam : undefined,
      pageSize: Number.isFinite(pageSizeParam) ? pageSizeParam : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }
}
