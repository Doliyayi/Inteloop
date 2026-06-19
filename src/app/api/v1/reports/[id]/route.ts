import { NextResponse } from "next/server";

import { apiContext } from "@/lib/apikeys/context";
import { getReport } from "@/lib/reports/history";

// GET /v1/reports/{id} — full report JSON (§15.2).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const ctx = await apiContext(request);
  if (!ctx.ok) return ctx.response;

  const report = await getReport(ctx.supabase, params.id, ctx.userId);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: report });
}
