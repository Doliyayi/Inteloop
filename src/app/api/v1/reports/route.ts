import { NextResponse } from "next/server";

import { apiContext, paginated } from "@/lib/apikeys/context";
import { clampPage, clampPageSize, listReports } from "@/lib/reports/history";

// GET /v1/reports — paginated list (§15.2). ?page=&per_page=
export async function GET(request: Request) {
  const ctx = await apiContext(request);
  if (!ctx.ok) return ctx.response;

  const url = new URL(request.url);
  const page = clampPage(Number(url.searchParams.get("page")) || undefined);
  const perPage = clampPageSize(Number(url.searchParams.get("per_page")) || undefined);

  const result = await listReports(ctx.supabase, { page, pageSize: perPage, userId: ctx.userId });
  return NextResponse.json(paginated(result.items, result.page, result.pageSize, result.total));
}
