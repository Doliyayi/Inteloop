import "server-only";

import { createBraveClient } from "../integrations/brave";
import { createResendClient } from "../integrations/resend";
import { createSlackNotifier } from "../integrations/slack";
import { createSupabaseAdminClient } from "../supabase/admin";
import { createReportGenerator } from "./generator";
import type { DailyWorkflowDeps } from "./dailyWorkflow";

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

export function buildDailyWorkflowDeps(): DailyWorkflowDeps {
  return {
    supabase: createSupabaseAdminClient(),
    brave: createBraveClient({ apiKey: required("BRAVE_SEARCH_API_KEY") }),
    generator: createReportGenerator({ apiKey: required("ANTHROPIC_API_KEY") }),
    resend: createResendClient({ apiKey: required("RESEND_API_KEY") }),
    slack: createSlackNotifier(),
    fromAddress: defaultFromAddress(),
    appUrl: defaultAppUrl(),
  };
}
