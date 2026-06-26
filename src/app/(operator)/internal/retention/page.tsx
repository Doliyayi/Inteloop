import { getRetentionStats } from "@/lib/analytics/retentionQueries";

export const metadata = { title: "Retention Dashboard — Inteloop Operator" };

// Refresh cohort data on every request; data is operator-only and low traffic.
export const dynamic = "force-dynamic";

function Pct({ value, target }: { value: number | null; target: number }) {
  if (value == null) return <span className="text-neutral-400">—</span>;
  const ok = value >= target;
  return (
    <span className={ok ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
      {value}%
    </span>
  );
}

export default async function RetentionPage() {
  const stats = await getRetentionStats();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Retention Dashboard
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cohort anchor: <code>subscribed_at</code> (paid conversion). Targets: Week-1 ≥ 80%, Week-4
          ≥ 89%.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card space-y-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Total Paying
          </p>
          <p className="text-3xl font-bold text-neutral-950">{stats.total_paying}</p>
        </div>
        <div className="card space-y-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Active Paying
          </p>
          <p className="text-3xl font-bold text-neutral-950">{stats.active_paying}</p>
        </div>
        <div className="card space-y-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Overall Wk-1
          </p>
          <p className="text-3xl font-bold">
            <Pct value={stats.overall_week_1_pct} target={80} />
          </p>
        </div>
        <div className="card space-y-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Overall Wk-4
          </p>
          <p className="text-3xl font-bold">
            <Pct value={stats.overall_week_4_pct} target={89} />
          </p>
        </div>
      </div>

      {/* Cohort table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
              <th className="px-4 py-3 font-medium text-neutral-600">Cohort week</th>
              <th className="px-4 py-3 text-right font-medium text-neutral-600">Subscribers</th>
              <th className="px-4 py-3 text-right font-medium text-neutral-600">Wk-1 retained</th>
              <th className="px-4 py-3 text-right font-medium text-neutral-600">Wk-1 %</th>
              <th className="px-4 py-3 text-right font-medium text-neutral-600">Wk-4 retained</th>
              <th className="px-4 py-3 text-right font-medium text-neutral-600">Wk-4 %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {stats.cohorts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  No paid subscribers yet.
                </td>
              </tr>
            )}
            {stats.cohorts.map((row) => (
              <tr key={row.cohort_week} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-mono text-neutral-700">
                  {new Date(row.cohort_week).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">{row.total_subscribers}</td>
                <td className="px-4 py-3 text-right text-neutral-700">
                  {row.retained_week_1 ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Pct value={row.week_1_pct} target={80} />
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">
                  {row.retained_week_4 ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Pct value={row.week_4_pct} target={89} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-400">
        Dash (—) = cohort not yet old enough for that retention window.
      </p>
    </div>
  );
}
