import Link from "next/link";

import { getLatestReport } from "@/lib/reports/history";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard — Inteloop" };

const TYPE_LABEL: Record<string, string> = {
  welcome: "Welcome report",
  weekly: "Weekly report",
  daily: "Daily briefing",
  battlecard: "Battlecard",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <p className="text-3xl font-semibold tracking-tight text-neutral-950">{value}</p>
      <p className="mt-1 text-sm text-neutral-500">{label}</p>
    </div>
  );
}

export default async function DashboardHomePage() {
  const supabase = createSupabaseServerClient();

  const [competitorsCount, reportsCount, latest] = await Promise.all([
    supabase.from("competitors").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("reports").select("id", { count: "exact", head: true }),
    getLatestReport(supabase),
  ]);

  const competitors = competitorsCount.count ?? 0;
  const reports = reportsCount.count ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
        Your <span className="font-serif font-normal italic">intelligence</span> desk
      </h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Competitors tracked" value={competitors} />
        <Stat label="Reports received" value={reports} />
        <Stat label="Cadence" value="Weekly" />
      </div>

      {latest ? (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-rose-500">
              Latest · {TYPE_LABEL[latest.report_type] ?? latest.report_type}
            </span>
            <span className="text-xs text-neutral-400">
              {formatDate(latest.delivered_at ?? latest.created_at)}
            </span>
          </div>
          <h2 className="text-lg font-semibold text-neutral-950">
            {latest.email_subject ?? TYPE_LABEL[latest.report_type] ?? "Report"}
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link href={`/dashboard/reports/${latest.id}`} className="btn-primary">
              Read report
            </Link>
            <Link href="/dashboard/reports" className="btn-secondary">
              All reports
            </Link>
          </div>
        </div>
      ) : (
        <div className="card flex flex-col items-start gap-4 p-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Report pending
          </span>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-neutral-950">
              Your first report is on its way
            </h2>
            <p className="text-sm text-neutral-600">
              {competitors === 0
                ? "Add a few competitors and we'll send your first briefing within the hour."
                : "We're putting together your baseline now. After that, a fresh briefing lands every Monday morning."}
            </p>
          </div>
          <Link href="/dashboard/competitors" className="btn-primary">
            Manage competitors
          </Link>
        </div>
      )}
    </div>
  );
}
