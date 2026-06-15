import "server-only";

import { createBraveClient } from "../integrations/brave";
import { createFirecrawlClient } from "../integrations/firecrawl";
import { createResendClient } from "../integrations/resend";
import { createSlackNotifier } from "../integrations/slack";
import { createSupabaseAdminClient } from "../supabase/admin";
import { createReportGenerator } from "./generator";
import type { WeeklyWorkflowDeps } from "./weeklyWorkflow";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

function defaultFromAddress(): string {
  return process.env.EMAIL_FROM ?? "Inteloop <noreply@inteloop.com>";
}

function defaultAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

// Builds the client bag used by runWeeklyReport from env. Throws if any
// required key is missing — the internal routes return 500 in that case.
export function buildWeeklyWorkflowDeps(): WeeklyWorkflowDeps {
  return {
    supabase: createSupabaseAdminClient(),
    firecrawl: createFirecrawlClient({ apiKey: required("FIRECRAWL_API_KEY") }),
    brave: createBraveClient({ apiKey: required("BRAVE_SEARCH_API_KEY") }),
    generator: createReportGenerator({ apiKey: required("ANTHROPIC_API_KEY") }),
    resend: createResendClient({ apiKey: required("RESEND_API_KEY") }),
    slack: createSlackNotifier(),
    fromAddress: defaultFromAddress(),
    appUrl: defaultAppUrl(),
  };
}
