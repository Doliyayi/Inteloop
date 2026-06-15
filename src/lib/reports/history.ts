import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// Read-side query helpers for the dashboard report history (PRD §11).
// The caller passes an RLS-scoped client (the user's session client in pages
// and routes), so ownership is enforced by Postgres — these helpers never
// filter by user_id themselves.

export const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type ReportType = "welcome" | "weekly" | "daily" | "battlecard";

// List rows omit the heavy `content` column.
export type ReportListItem = {
  id: string;
  report_type: ReportType;
  status: string;
  email_subject: string | null;
  delivered_at: string | null;
  created_at: string;
};

export type ReportDetail = ReportListItem & {
  content: unknown;
};

export type ReportPage = {
  items: ReportListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

const LIST_COLUMNS = "id, report_type, status, email_subject, delivered_at, created_at";

export function clampPage(value: number | undefined): number {
  if (!value || !Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

export function clampPageSize(value: number | undefined): number {
  // Treat missing/invalid/non-positive sizes as the default rather than
  // silently collapsing to a 1-item page.
  if (!value || !Number.isFinite(value) || value < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(value), MAX_PAGE_SIZE);
}

// Paginated, newest-first list of the caller's reports (§11.1).
export async function listReports(
  supabase: SupabaseClient,
  opts: { page?: number; pageSize?: number } = {},
): Promise<ReportPage> {
  const page = clampPage(opts.page);
  const pageSize = clampPageSize(opts.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from("reports")
    .select(LIST_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(`listReports failed: ${error.message}`);

  const total = count ?? 0;
  const items = (data ?? []) as ReportListItem[];
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasMore: from + items.length < total,
  };
}

// Single report including its structured content, or null when the id doesn't
// exist or isn't visible to the caller (RLS) — both surface as 404 upstream.
export async function getReport(
  supabase: SupabaseClient,
  id: string,
): Promise<ReportDetail | null> {
  const { data, error } = await supabase
    .from("reports")
    .select(`${LIST_COLUMNS}, content`)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getReport failed: ${error.message}`);
  return (data as ReportDetail | null) ?? null;
}

// Latest delivered report for the dashboard home summary (§11.2).
export async function getLatestReport(supabase: SupabaseClient): Promise<ReportDetail | null> {
  const { data, error } = await supabase
    .from("reports")
    .select(`${LIST_COLUMNS}, content`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getLatestReport failed: ${error.message}`);
  return (data as ReportDetail | null) ?? null;
}
