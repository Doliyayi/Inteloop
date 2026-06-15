import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";

import type { ResendClient } from "@/lib/integrations/resend";
import type { DarajaClient } from "@/lib/integrations/daraja";
import type { KcbClient } from "@/lib/integrations/kcb";
import { handleStripeEvent, type StripeWebhookDeps } from "@/lib/billing/webhook";
import {
  processKcbCallback,
  processMpesaCallback,
  type MobileMoneyDeps,
} from "@/lib/billing/mobileMoney";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!ANON_KEY || !SERVICE_KEY) {
  throw new Error(
    "SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set. Run pnpm db:start.",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdUserIds: string[] = [];
const sentEmails: { to: string | string[]; subject: string }[] = [];

const mockResend: ResendClient = {
  async send(input) {
    sentEmails.push({ to: input.to, subject: input.subject });
    return { ok: true, id: `mock-${sentEmails.length}` };
  },
};

// Mobile money callback tests never call the upstream clients; stub to fail
// loudly if a code path unexpectedly does.
const failDaraja: DarajaClient = {
  async stkPush() {
    throw new Error("daraja should not be called in callback processing");
  },
};
const failKcb: KcbClient = {
  async initiatePayment() {
    throw new Error("kcb should not be called in callback processing");
  },
};

function webhookDeps(): StripeWebhookDeps {
  return {
    supabase: admin,
    resend: mockResend,
    fromAddress: "Inteloop <noreply@inteloop.test>",
    portalUrl: "https://app.inteloop.test/dashboard/settings",
  };
}

function mobileMoneyDeps(): MobileMoneyDeps {
  return {
    supabase: admin,
    daraja: failDaraja,
    kcb: failKcb,
    resend: mockResend,
    fromAddress: "Inteloop <noreply@inteloop.test>",
    mpesaCallbackUrl: "https://app.inteloop.test/api/webhooks/mpesa",
    kcbCallbackUrl: "https://app.inteloop.test/api/webhooks/kcb",
  };
}

async function createUser(): Promise<{ id: string; email: string }> {
  const email = `billing-${randomUUID()}@inteloop.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "Billing-Test-1!",
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("user not created");
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email };
}

async function getProfile(id: string) {
  const { data } = await admin.from("profiles").select("*").eq("id", id).single();
  return data as Record<string, unknown>;
}

beforeAll(() => {
  // planFromStripePriceId reads these to map subscription price ids back to plans.
  process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID = "price_growth_monthly_test";
});

afterAll(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

beforeEach(() => {
  sentEmails.length = 0;
});

// =========================================================
// Stripe webhook (PRD §10.5, §21.5)
// =========================================================

describe("handleStripeEvent", () => {
  it("checkout.session.completed sets plan, ids, and payment_method", async () => {
    const user = await createUser();
    const event = {
      id: `evt_${randomUUID()}`,
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_123",
          subscription: "sub_123",
          client_reference_id: user.id,
          metadata: { user_id: user.id, plan: "starter", interval: "monthly" },
        },
      },
    } as unknown as Stripe.Event;

    const result = await handleStripeEvent(event, webhookDeps());
    expect(result).toMatchObject({ ok: true, status: "processed" });

    const profile = await getProfile(user.id);
    expect(profile.plan).toBe("starter");
    expect(profile.stripe_customer_id).toBe("cus_123");
    expect(profile.stripe_subscription_id).toBe("sub_123");
    expect(profile.payment_method).toBe("stripe");
    expect(profile.subscribed_at).not.toBeNull();
  });

  it("is idempotent — a duplicate event id is skipped (§21.5)", async () => {
    const user = await createUser();
    const event = {
      id: `evt_${randomUUID()}`,
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_dupe",
          subscription: "sub_dupe",
          metadata: { user_id: user.id, plan: "starter" },
        },
      },
    } as unknown as Stripe.Event;

    const first = await handleStripeEvent(event, webhookDeps());
    expect(first).toMatchObject({ ok: true, status: "processed" });
    const second = await handleStripeEvent(event, webhookDeps());
    expect(second).toMatchObject({ ok: true, status: "duplicate" });
  });

  it("customer.subscription.updated reflects the plan and period end", async () => {
    const user = await createUser();
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86_400;
    const event = {
      id: `evt_${randomUUID()}`,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_up",
          customer: "cus_up",
          metadata: { user_id: user.id },
          current_period_end: periodEnd,
          items: { data: [{ price: { id: "price_growth_monthly_test" } }] },
        },
      },
    } as unknown as Stripe.Event;

    await handleStripeEvent(event, webhookDeps());
    const profile = await getProfile(user.id);
    expect(profile.plan).toBe("growth");
    expect(profile.stripe_current_period_end).not.toBeNull();
  });

  it("customer.subscription.deleted cancels the plan (§10.10)", async () => {
    const user = await createUser();
    const event = {
      id: `evt_${randomUUID()}`,
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_del", customer: "cus_del", metadata: { user_id: user.id } } },
    } as unknown as Stripe.Event;

    await handleStripeEvent(event, webhookDeps());
    const profile = await getProfile(user.id);
    expect(profile.plan).toBe("cancelled");
    expect(profile.cancelled_at).not.toBeNull();
  });

  it("invoice.payment_failed flags the profile and sends a dunning email (§10.11)", async () => {
    const user = await createUser();
    await admin.from("profiles").update({ stripe_customer_id: "cus_fail" }).eq("id", user.id);
    const event = {
      id: `evt_${randomUUID()}`,
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_fail" } },
    } as unknown as Stripe.Event;

    await handleStripeEvent(event, webhookDeps());
    const profile = await getProfile(user.id);
    expect(profile.plan).toBe("payment_failed");
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(user.email);
  });

  it("invoice.payment_succeeded clears a payment_failed flag", async () => {
    const user = await createUser();
    await admin
      .from("profiles")
      .update({ stripe_customer_id: "cus_ok", plan: "payment_failed" })
      .eq("id", user.id);
    const event = {
      id: `evt_${randomUUID()}`,
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_ok",
          lines: { data: [{ price: { id: "price_growth_monthly_test" } }] },
        },
      },
    } as unknown as Stripe.Event;

    await handleStripeEvent(event, webhookDeps());
    const profile = await getProfile(user.id);
    expect(profile.plan).toBe("growth");
  });

  it("ignores unhandled event types", async () => {
    const event = {
      id: `evt_${randomUUID()}`,
      type: "customer.created",
      data: { object: {} },
    } as unknown as Stripe.Event;
    const result = await handleStripeEvent(event, webhookDeps());
    expect(result).toMatchObject({ ok: true, status: "ignored" });
  });
});

// =========================================================
// Mobile money callbacks (PRD §10.6, §21.4)
// =========================================================

async function insertPendingPayment(
  userId: string,
  opts: { provider: "mpesa" | "kcb"; checkoutRequestId: string; plan?: string; amount?: number },
): Promise<string> {
  const { data, error } = await admin
    .from("payments")
    .insert({
      user_id: userId,
      provider: opts.provider,
      plan: opts.plan ?? "starter",
      billing_interval: "monthly",
      amount: opts.amount ?? 25_500,
      currency: "KES",
      status: "pending",
      checkout_request_id: opts.checkoutRequestId,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("payment not inserted");
  return (data as { id: string }).id;
}

describe("processMpesaCallback", () => {
  it("activates the subscription on ResultCode 0", async () => {
    const user = await createUser();
    const checkoutId = `co_${randomUUID()}`;
    const paymentId = await insertPendingPayment(user.id, {
      provider: "mpesa",
      checkoutRequestId: checkoutId,
      plan: "growth",
      amount: 51_400,
    });

    const result = await processMpesaCallback(
      {
        merchantRequestId: "mr",
        checkoutRequestId: checkoutId,
        resultCode: 0,
        resultDesc: "ok",
        amount: 51_400,
        receipt: `RCPT${randomUUID().slice(0, 8)}`,
        phone: "254712345678",
      },
      mobileMoneyDeps(),
    );
    expect(result.status).toBe("activated");

    const { data: payment } = await admin
      .from("payments")
      .select("status, provider_reference")
      .eq("id", paymentId)
      .single();
    expect((payment as { status: string }).status).toBe("success");

    const profile = await getProfile(user.id);
    expect(profile.plan).toBe("growth");
    expect(profile.payment_method).toBe("mpesa");
    expect(profile.currency).toBe("KES");
    expect(profile.subscription_renewal_date).not.toBeNull();
    expect(sentEmails).toHaveLength(1);
  });

  it("ignores a duplicate receipt without double-crediting (§21.4)", async () => {
    const user = await createUser();
    const receipt = `RCPT${randomUUID().slice(0, 8)}`;
    const checkoutId = `co_${randomUUID()}`;
    await insertPendingPayment(user.id, { provider: "mpesa", checkoutRequestId: checkoutId });

    const cb = {
      merchantRequestId: "mr",
      checkoutRequestId: checkoutId,
      resultCode: 0,
      resultDesc: "ok",
      amount: 25_500,
      receipt,
      phone: "254712345678",
    };
    const first = await processMpesaCallback(cb, mobileMoneyDeps());
    expect(first.status).toBe("activated");
    const second = await processMpesaCallback(cb, mobileMoneyDeps());
    expect(second.status).toBe("duplicate");
  });

  it("marks the payment failed on a non-zero ResultCode and leaves plan on trial", async () => {
    const user = await createUser();
    const checkoutId = `co_${randomUUID()}`;
    const paymentId = await insertPendingPayment(user.id, {
      provider: "mpesa",
      checkoutRequestId: checkoutId,
    });

    const result = await processMpesaCallback(
      {
        merchantRequestId: "mr",
        checkoutRequestId: checkoutId,
        resultCode: 1032,
        resultDesc: "Request cancelled by user",
        amount: null,
        receipt: null,
        phone: null,
      },
      mobileMoneyDeps(),
    );
    expect(result.status).toBe("failed");

    const { data: payment } = await admin
      .from("payments")
      .select("status, result_code")
      .eq("id", paymentId)
      .single();
    expect((payment as { status: string }).status).toBe("failed");
    expect((await getProfile(user.id)).plan).toBe("trial");
  });

  it("returns 'unmatched' when no payment row exists", async () => {
    const result = await processMpesaCallback(
      {
        merchantRequestId: "mr",
        checkoutRequestId: "co_does_not_exist",
        resultCode: 0,
        resultDesc: "ok",
        amount: 25_500,
        receipt: null,
        phone: null,
      },
      mobileMoneyDeps(),
    );
    expect(result.status).toBe("unmatched");
  });
});

describe("processKcbCallback", () => {
  it("activates the subscription on a SUCCESS status", async () => {
    const user = await createUser();
    const ref = `KCB_${randomUUID().slice(0, 8)}`;
    await insertPendingPayment(user.id, {
      provider: "kcb",
      checkoutRequestId: ref,
      plan: "pro",
      amount: 103_100,
    });

    const result = await processKcbCallback(
      {
        transactionReference: ref,
        resultCode: null,
        status: "SUCCESS",
        amount: 103_100,
        accountReference: "INT-pro",
        description: null,
      },
      mobileMoneyDeps(),
    );
    expect(result.status).toBe("activated");
    const profile = await getProfile(user.id);
    expect(profile.plan).toBe("pro");
    expect(profile.payment_method).toBe("kcb");
  });
});

// =========================================================
// payments RLS (PRD §16.2)
// =========================================================

describe("payments RLS", () => {
  it("a user reads only their own payments", async () => {
    const owner = await createUser();
    const other = await createUser();
    await insertPendingPayment(owner.id, {
      provider: "mpesa",
      checkoutRequestId: `co_${randomUUID()}`,
    });

    const ownerClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await ownerClient.auth.signInWithPassword({ email: owner.email, password: "Billing-Test-1!" });
    const otherClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await otherClient.auth.signInWithPassword({ email: other.email, password: "Billing-Test-1!" });

    const ownRows = await ownerClient.from("payments").select("id");
    expect(ownRows.error).toBeNull();
    expect(ownRows.data).toHaveLength(1);

    const otherRows = await otherClient.from("payments").select("id");
    expect(otherRows.error).toBeNull();
    expect(otherRows.data).toEqual([]);
  });
});
