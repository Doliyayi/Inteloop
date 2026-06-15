import "server-only";

import { createDarajaClient, type DarajaEnv } from "../integrations/daraja";
import { createKcbClient, type KcbEnv } from "../integrations/kcb";
import { createResendClient } from "../integrations/resend";
import { createSupabaseAdminClient } from "../supabase/admin";
import type { MobileMoneyDeps } from "./mobileMoney";
import type { StripeWebhookDeps } from "./webhook";

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

function mpesaEnv(): DarajaEnv {
  return process.env.MPESA_ENV === "production" ? "production" : "sandbox";
}

function kcbEnv(): KcbEnv {
  return process.env.KCB_ENV === "production" ? "production" : "sandbox";
}

// Deps for the Stripe webhook handler. The dunning email links to the billing
// dashboard, where the Customer Portal button lives.
export function buildStripeWebhookDeps(): StripeWebhookDeps {
  return {
    supabase: createSupabaseAdminClient(),
    resend: createResendClient({ apiKey: required("RESEND_API_KEY") }),
    fromAddress: defaultFromAddress(),
    portalUrl: `${appUrl()}/dashboard/settings`,
  };
}

export function buildMobileMoneyDeps(): MobileMoneyDeps {
  return {
    supabase: createSupabaseAdminClient(),
    daraja: createDarajaClient({
      consumerKey: required("MPESA_CONSUMER_KEY"),
      consumerSecret: required("MPESA_CONSUMER_SECRET"),
      shortCode: required("MPESA_BUSINESS_SHORT_CODE"),
      passkey: required("MPESA_PASSKEY"),
      env: mpesaEnv(),
    }),
    kcb: createKcbClient({
      apiKey: required("KCB_API_KEY"),
      merchantCode: required("KCB_MERCHANT_CODE"),
      env: kcbEnv(),
    }),
    resend: createResendClient({ apiKey: required("RESEND_API_KEY") }),
    fromAddress: defaultFromAddress(),
    mpesaCallbackUrl: required("MPESA_CALLBACK_URL"),
    kcbCallbackUrl: required("KCB_CALLBACK_URL"),
  };
}
