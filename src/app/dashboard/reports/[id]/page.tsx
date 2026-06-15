import Link from "next/link";
import { notFound } from "next/navigation";

import { ReportView } from "@/components/reports/ReportView";
import { getReport } from "@/lib/reports/history";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TYPE_LABEL: Record<string, string> = {
  welcome: "Welcome report",
  weekly: "Weekly report",
  daily: "Daily briefing",
  battlecard: "Battlecard",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type Props = { params: { id: string } };

export default async function ReportDetailPage({ params }: Props) {
  const supabase = createSupabaseServerClient();
  // RLS scopes this to the signed-in user; a missing or foreign id returns null.
  const report = await getReport(supabase, params.id);
  if (!report) notFound();

  const title = report.email_subject ?? TYPE_LABEL[report.report_type] ?? "Report";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/dashboard/reports" className="link text-sm">
        ← All reports
      </Link>

      <header className="space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-rose-500">
          {TYPE_LABEL[report.report_type] ?? report.report_type}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">{title}</h1>
        <p className="text-sm text-neutral-500">
          {formatDate(report.delivered_at ?? report.created_at)}
        </p>
      </header>

      <ReportView reportType={report.report_type} content={report.content} />
    </div>
  );
}
