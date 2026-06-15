import "server-only";

import { createResendClient } from "../integrations/resend";
import { createSupabaseAdminClient } from "../supabase/admin";
import type { LifecycleDeps } from "./workflow";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

function defaultFromAddress(): string {
  return process.env.EMAIL_FROM ?? "Inteloop <noreply@inteloop.com>";
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

// Where cancellation emails point. A dedicated survey (Typeform/inline form,
// §18) can be set via CANCELLATION_SURVEY_URL; otherwise fall back to settings.
export function surveyUrl(): string {
  return process.env.CANCELLATION_SURVEY_URL ?? `${appUrl()}/dashboard/settings`;
}

export function buildLifecycleDeps(): LifecycleDeps {
  return {
    supabase: createSupabaseAdminClient(),
    resend: createResendClient({ apiKey: required("RESEND_API_KEY") }),
    fromAddress: defaultFromAddress(),
    appUrl: appUrl(),
    surveyUrl: surveyUrl(),
  };
}
