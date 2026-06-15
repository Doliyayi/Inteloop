-- =========================================================
-- payments — mobile money (Mpesa / KCB) transaction ledger
-- Source of truth: docs/inteloop-prd.md §10.6, §10.7, §10.9, §21.4
--
-- Stripe billing state lives on profiles (stripe_* columns) and is
-- reconciled via webhooks; Stripe needs no ledger row here. Mobile money
-- has no provider-side subscription object, so every STK Push / KCB
-- initiation is recorded here and reconciled by its callback.
-- =========================================================

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  provider            text not null
    check (provider in ('mpesa', 'kcb')),
  plan                text not null
    check (plan in ('starter', 'growth', 'pro')),
  billing_interval    text not null default 'monthly'
    check (billing_interval in ('monthly', 'annual')),
  -- Whole KES (mobile money currencies have no minor unit in this product).
  amount              integer not null check (amount > 0),
  currency            text not null default 'KES'
    check (currency in ('KES')),
  status              text not null default 'pending'
    check (status in ('pending', 'pending_confirmation', 'success', 'failed', 'cancelled')),
  -- Mpesa STK Push correlation ids (returned by Daraja at initiation).
  checkout_request_id text,
  merchant_request_id text,
  -- Provider settlement reference: Mpesa MpesaReceiptNumber / KCB transaction id.
  -- Unique per provider so a duplicate callback cannot double-credit (§21.4).
  provider_reference  text,
  -- Our own reference passed to the provider (KCB account reference, etc.).
  account_reference   text,
  phone               text,
  result_code         text,
  result_desc         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Dedupe guard for §21.4 "Duplicate Mpesa MpesaReceiptNumber".
create unique index payments_provider_reference_uidx
  on public.payments (provider, provider_reference)
  where provider_reference is not null;

-- Callbacks arrive keyed by CheckoutRequestID; lookups must be fast.
create unique index payments_checkout_request_id_uidx
  on public.payments (checkout_request_id)
  where checkout_request_id is not null;

create index payments_user_id_created_at_idx
  on public.payments (user_id, created_at desc);

-- Maintain updated_at (reuses the trigger function from the initial schema).
create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

-- =========================================================
-- RLS — users read their own payment history; all writes are service-only
-- (initiation routes and webhook handlers use the service-role client).
-- =========================================================
alter table public.payments enable row level security;

create policy payments_select_own
  on public.payments
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Grant base privileges (the initial migration's ALL TABLES grant is a
-- one-time snapshot and does not cover tables created later). RLS still
-- gates row visibility for anon/authenticated.
grant all on public.payments to anon, authenticated, service_role;
