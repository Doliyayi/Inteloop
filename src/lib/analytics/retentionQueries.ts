import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CohortRow = {
  cohort_week: string; // ISO date string (Monday of the week)
  total_subscribers: number;
  retained_week_1: number | null; // null when cohort < 7 days old
  retained_week_4: number | null; // null when cohort < 28 days old
  week_1_pct: number | null;
  week_4_pct: number | null;
};

export type RetentionStats = {
  cohorts: CohortRow[];
  overall_week_1_pct: number | null;
  overall_week_4_pct: number | null;
  total_paying: number;
  active_paying: number;
};

// Cohort retention anchored to subscribed_at (paid conversion).
// Week-1 = still active 7 days after subscription start.
// Week-4 = still active 28 days after subscription start.
// "Active" = cancelled_at IS NULL OR cancelled_at > threshold.
// Cohorts younger than the retention window are excluded from that window's
// calculation (null) to avoid false 100% numbers.
export async function getRetentionStats(): Promise<RetentionStats> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc("retention_cohorts");
  if (error) throw error;

  const cohorts = (data as CohortRow[]).map((row) => ({
    ...row,
    total_subscribers: Number(row.total_subscribers),
    retained_week_1: row.retained_week_1 != null ? Number(row.retained_week_1) : null,
    retained_week_4: row.retained_week_4 != null ? Number(row.retained_week_4) : null,
    week_1_pct:
      row.retained_week_1 != null && Number(row.total_subscribers) > 0
        ? Math.round((Number(row.retained_week_1) / Number(row.total_subscribers)) * 100)
        : null,
    week_4_pct:
      row.retained_week_4 != null && Number(row.total_subscribers) > 0
        ? Math.round((Number(row.retained_week_4) / Number(row.total_subscribers)) * 100)
        : null,
  }));

  // Aggregate across all mature cohorts.
  const w1cohorts = cohorts.filter((c) => c.retained_week_1 != null);
  const w4cohorts = cohorts.filter((c) => c.retained_week_4 != null);

  const sum = (rows: CohortRow[], key: "retained_week_1" | "retained_week_4") =>
    rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);

  const totalW1 = w1cohorts.reduce((a, r) => a + r.total_subscribers, 0);
  const totalW4 = w4cohorts.reduce((a, r) => a + r.total_subscribers, 0);

  const overall_week_1_pct =
    totalW1 > 0 ? Math.round((sum(w1cohorts, "retained_week_1") / totalW1) * 100) : null;
  const overall_week_4_pct =
    totalW4 > 0 ? Math.round((sum(w4cohorts, "retained_week_4") / totalW4) * 100) : null;

  const { data: totals } = await admin
    .from("profiles")
    .select("plan", { count: "exact" })
    .not("subscribed_at", "is", null);

  const total_paying = totals?.length ?? 0;

  const { data: active } = await admin
    .from("profiles")
    .select("plan", { count: "exact" })
    .not("subscribed_at", "is", null)
    .in("plan", ["starter", "growth", "pro"]);

  const active_paying = active?.length ?? 0;

  return { cohorts, overall_week_1_pct, overall_week_4_pct, total_paying, active_paying };
}
