-- =========================================================
-- lifecycle_emails — idempotency ledger for one-shot lifecycle emails
-- Source: docs/inteloop-prd.md §18 (email sequences).
--
-- Each (user, email_type) is sent at most once. The cron batches claim a row
-- here before sending; the composite primary key makes a duplicate claim a
-- no-op (same pattern as stripe_events for webhooks).
-- =========================================================

create table public.lifecycle_emails (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  email_type text not null
    check (email_type in (
      'day5_teaser',
      'day7_conversion',
      'subscription_cancelled',
      'cancellation_survey'
    )),
  sent_at    timestamptz not null default now(),
  primary key (user_id, email_type)
);

-- Service-role only (cron + webhook handlers). No policies = closed to
-- anon/authenticated.
alter table public.lifecycle_emails enable row level security;

grant all on public.lifecycle_emails to anon, authenticated, service_role;
