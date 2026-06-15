import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import type { ResendClient } from "../integrations/resend";
import { paymentFailedSubject, renderPaymentFailedHtml } from "./billingEmail";
import { planFromStripePriceId } from "./plans";

// Idempotent Stripe webhook processing.
// Source: docs/inteloop-prd.md §10.5 (event → action table) and §21.5
// (idempotency via the stripe_events table).

export type StripeWebhookDeps = {
  supabase: SupabaseClient; // service role — bypasses RLS
  resend: ResendClient;
  fromAddress: string;
  // Where the dunning email's "update payment" button points.
  portalUrl: string;
};

export type StripeWebhookResult =
  | { ok: true; status: "processed" | "duplicate" | "ignored"; detail?: string }
  | { ok: false; error: string };

// Events we act on. Anything else is acknowledged (200) but ignored so Stripe
// stops retrying — see §10.5.
const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
]);

function unixToIso(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number") return null;
  return new Date(seconds * 1000).toISOString();
}

// Resolve our profile id for an event. Subscription/checkout objects carry it
// in metadata; invoice events fall back to a lookup by Stripe customer id.
async function resolveUserId(
  supabase: SupabaseClient,
  opts: { metadataUserId?: string | null; customerId?: string | null },
): Promise<string | null> {
  if (opts.metadataUserId) return opts.metadataUserId;
  if (!opts.customerId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", opts.customerId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

function stripeId(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

// =========================================================
// Per-event handlers — each returns a short action label for logging.
// =========================================================

async function onCheckoutCompleted(event: Stripe.Event, deps: StripeWebhookDeps): Promise<string> {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = await resolveUserId(deps.supabase, {
    metadataUserId: session.metadata?.user_id ?? session.client_reference_id,
    customerId: stripeId(session.customer),
  });
  if (!userId) throw new Error("checkout.session.completed: could not resolve user");

  const plan = session.metadata?.plan;
  await deps.supabase
    .from("profiles")
    .update({
      ...(plan ? { plan } : {}),
      payment_method: "stripe",
      stripe_customer_id: stripeId(session.customer),
      stripe_subscription_id: stripeId(session.subscription),
      subscribed_at: new Date().toISOString(),
    })
    .eq("id", userId);
  return `checkout completed → plan=${plan ?? "(unchanged)"}`;
}

async function onSubscriptionUpdated(
  event: Stripe.Event,
  deps: StripeWebhookDeps,
): Promise<string> {
  const sub = event.data.object as Stripe.Subscription;
  const userId = await resolveUserId(deps.supabase, {
    metadataUserId: sub.metadata?.user_id,
    customerId: stripeId(sub.customer),
  });
  if (!userId) throw new Error("customer.subscription.updated: could not resolve user");

  const priceId = sub.items.data[0]?.price?.id;
  const plan = priceId ? planFromStripePriceId(priceId) : null;
  const periodEnd = unixToIso(sub.current_period_end);

  await deps.supabase
    .from("profiles")
    .update({
      ...(plan ? { plan } : {}),
      stripe_subscription_id: sub.id,
      stripe_current_period_end: periodEnd,
    })
    .eq("id", userId);
  return `subscription updated → plan=${plan ?? "(unchanged)"} period_end=${periodEnd ?? "?"}`;
}

async function onSubscriptionDeleted(
  event: Stripe.Event,
  deps: StripeWebhookDeps,
): Promise<string> {
  const sub = event.data.object as Stripe.Subscription;
  const userId = await resolveUserId(deps.supabase, {
    metadataUserId: sub.metadata?.user_id,
    customerId: stripeId(sub.customer),
  });
  if (!userId) throw new Error("customer.subscription.deleted: could not resolve user");

  await deps.supabase
    .from("profiles")
    .update({ plan: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", userId);
  return "subscription deleted → plan=cancelled";
}

async function onPaymentFailed(event: Stripe.Event, deps: StripeWebhookDeps): Promise<string> {
  const invoice = event.data.object as Stripe.Invoice;
  const userId = await resolveUserId(deps.supabase, {
    customerId: stripeId(invoice.customer),
  });
  if (!userId) throw new Error("invoice.payment_failed: could not resolve user");

  // Look up the recipient address before flipping the flag.
  const { data: profile } = await deps.supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  await deps.supabase.from("profiles").update({ plan: "payment_failed" }).eq("id", userId);

  const email = (profile as { email: string } | null)?.email;
  if (email) {
    // §10.11: dunning email within 1 hour. n8n schedules the 1/3/7-day cadence;
    // this fires the first notice immediately on the failed-payment event.
    await deps.resend.send({
      from: deps.fromAddress,
      to: email,
      subject: paymentFailedSubject(),
      html: renderPaymentFailedHtml({ portalUrl: deps.portalUrl }),
    });
  }
  return "payment failed → plan=payment_failed, dunning email sent";
}

async function onPaymentSucceeded(event: Stripe.Event, deps: StripeWebhookDeps): Promise<string> {
  const invoice = event.data.object as Stripe.Invoice;
  const userId = await resolveUserId(deps.supabase, {
    customerId: stripeId(invoice.customer),
  });
  if (!userId) throw new Error("invoice.payment_succeeded: could not resolve user");

  // §10.5: only clear a previously-set payment_failed flag. Restore the plan
  // implied by the invoice's price; if we can't derive it, leave plan as-is.
  const { data: profile } = await deps.supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  if ((profile as { plan: string } | null)?.plan !== "payment_failed") {
    return "payment succeeded → no payment_failed flag to clear";
  }

  const priceId = invoice.lines.data[0]?.price?.id;
  const plan = priceId ? planFromStripePriceId(priceId) : null;
  if (!plan) {
    return "payment succeeded → could not derive plan, flag left unchanged";
  }
  await deps.supabase.from("profiles").update({ plan }).eq("id", userId);
  return `payment succeeded → plan restored to ${plan}`;
}

// =========================================================
// Entry point
// =========================================================

export async function handleStripeEvent(
  event: Stripe.Event,
  deps: StripeWebhookDeps,
): Promise<StripeWebhookResult> {
  if (!HANDLED_EVENTS.has(event.type)) {
    return { ok: true, status: "ignored", detail: event.type };
  }

  // Atomically claim the event id (§21.5). A duplicate delivery hits the
  // primary-key conflict and is skipped without reprocessing.
  const { error: claimError } = await deps.supabase
    .from("stripe_events")
    .insert({ event_id: event.id, event_type: event.type });
  if (claimError) {
    // 23505 = unique_violation → already processed.
    if ((claimError as { code?: string }).code === "23505") {
      return { ok: true, status: "duplicate", detail: event.id };
    }
    return { ok: false, error: `claim failed: ${claimError.message}` };
  }

  try {
    let detail: string;
    switch (event.type) {
      case "checkout.session.completed":
        detail = await onCheckoutCompleted(event, deps);
        break;
      case "customer.subscription.updated":
        detail = await onSubscriptionUpdated(event, deps);
        break;
      case "customer.subscription.deleted":
        detail = await onSubscriptionDeleted(event, deps);
        break;
      case "invoice.payment_failed":
        detail = await onPaymentFailed(event, deps);
        break;
      case "invoice.payment_succeeded":
        detail = await onPaymentSucceeded(event, deps);
        break;
      default:
        detail = "unhandled";
    }
    return { ok: true, status: "processed", detail };
  } catch (err) {
    // Release the claim so Stripe's retry reprocesses this event.
    await deps.supabase.from("stripe_events").delete().eq("event_id", event.id);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
