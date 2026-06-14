import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ApiUsageProvider = "claude" | "firecrawl" | "brave" | "resend";

export type ApiUsageStatus =
  | "success"
  | "failed"
  | "rate_limited"
  | "timeout"
  | "invalid_json"
  | "context_length"
  | "blocked"
  | "outage"
  | "auth"
  | "unknown";

export type ApiUsageRecord = {
  user_id?: string | null;
  provider: ApiUsageProvider;
  call_type: string;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  status: ApiUsageStatus;
  error_detail?: Record<string, unknown> | null;
};

// Inserts a usage row. Errors are logged but swallowed — failure to log
// must never break the calling report workflow.
export async function logApiUsage(supabase: SupabaseClient, record: ApiUsageRecord): Promise<void> {
  const { error } = await supabase.from("api_usage").insert(record);
  if (error) {
    console.error("[api_usage] log failed:", error.message);
  }
}
