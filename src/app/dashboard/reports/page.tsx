import Link from "next/link";

import { listReports, type ReportListItem } from "@/lib/reports/history";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Reports — Inteloop" };

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

function reportTitle(r: ReportListItem): string {
  return r.email_subject ?? TYPE_LABEL[r.report_type] ?? "Report";
}

type Props = { searchParams?: { page?: string } };

export default async function ReportsPage({ searchParams }: Props) {
  const supabase = createSupabaseServerClient();
  const requestedPage = Number(searchParams?.page);
  const { items, page, total, totalPages, hasMore } = await listReports(supabase, {
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Reports</h1>
        {total > 0 ? (
          <span className="text-sm text-neutral-500">
            {total} report{total === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="card text-center">
          <p className="text-sm text-neutral-600">
            Your first report is on its way. Check back Monday morning.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/dashboard/reports/${r.id}`}
                className="card flex items-center justify-between gap-4 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-rose-500/10"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-950">{reportTitle(r)}</p>
                  <p className="mt-0.5 text-sm text-neutral-500">
                    <span className="capitalize">{TYPE_LABEL[r.report_type] ?? r.report_type}</span>{" "}
                    · {formatDate(r.created_at)}
                  </p>
                </div>
                <span aria-hidden className="text-neutral-300">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-between pt-2">
          {page > 1 ? (
            <Link href={`/dashboard/reports?page=${page - 1}`} className="btn-secondary">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-neutral-500">
            Page {page} of {totalPages}
          </span>
          {hasMore ? (
            <Link href={`/dashboard/reports?page=${page + 1}`} className="btn-secondary">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
