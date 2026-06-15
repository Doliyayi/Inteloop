import "server-only";

import Stripe from "stripe";

import type { BillingInterval, PaidPlan } from "./plans";

// Thin wrapper around the Stripe SDK. Keeps the SDK surface we depend on small
// and gives routes a discriminated result instead of throwing SDK errors.

export type StripeBillingConfig = {
  secretKey: string;
  webhookSecret: string;
};

export type CheckoutSessionInput = {
  priceId: string;
  plan: PaidPlan;
  interval: BillingInterval;
  // Our user id — surfaced on the session and the resulting subscription so
  // the webhook can map the event back to a profile.
  userId: string;
  successUrl: string;
  cancelUrl: string;
  // Reuse an existing Stripe customer when we already created one; otherwise
  // pass the email and let Checkout create the customer.
  customerId?: string;
  customerEmail?: string;
  // Unix seconds. When set, the subscription stays on trial until this moment
  // and the first charge runs then (§10.3 — trial_end is 8 days from signup).
  trialEnd?: number;
};

export type CheckoutResult =
  | { ok: true; url: string; sessionId: string }
  | { ok: false; error: string };

export type PortalResult = { ok: true; url: string } | { ok: false; error: string };

export type WebhookParseResult = { ok: true; event: Stripe.Event } | { ok: false; error: string };

export type StripeBilling = {
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutResult>;
  createPortalSession(customerId: string, returnUrl: string): Promise<PortalResult>;
  // Verifies the Stripe-Signature header and returns the typed event. Never
  // weaken this — an unverified payload must never reach state changes.
  constructWebhookEvent(payload: string | Buffer, signature: string): WebhookParseResult;
};

export function createStripeBilling(config: StripeBillingConfig): StripeBilling {
  // Omit apiVersion to use the SDK's pinned default for this major version.
  const stripe = new Stripe(config.secretKey);

  async function createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutResult> {
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.userId,
        ...(input.customerId
          ? { customer: input.customerId }
          : input.customerEmail
            ? { customer_email: input.customerEmail }
            : {}),
        metadata: { user_id: input.userId, plan: input.plan, interval: input.interval },
        subscription_data: {
          metadata: { user_id: input.userId, plan: input.plan, interval: input.interval },
          ...(input.trialEnd ? { trial_end: input.trialEnd } : {}),
        },
        allow_promotion_codes: true,
      });
      if (!session.url) return { ok: false, error: "Stripe returned no checkout URL." };
      return { ok: true, url: session.url, sessionId: session.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async function createPortalSession(customerId: string, returnUrl: string): Promise<PortalResult> {
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return { ok: true, url: session.url };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  function constructWebhookEvent(payload: string | Buffer, signature: string): WebhookParseResult {
    try {
      const event = stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
      return { ok: true, event };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { createCheckoutSession, createPortalSession, constructWebhookEvent };
}

let defaultClient: StripeBilling | null = null;
export function stripeBilling(): StripeBilling {
  if (!defaultClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not set.");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
    defaultClient = createStripeBilling({ secretKey, webhookSecret });
  }
  return defaultClient;
}
