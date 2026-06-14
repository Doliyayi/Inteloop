-- =========================================================
-- Initial schema for Inteloop
-- Source of truth: docs/inteloop-prd.md §16 (+ §10.8, §21.5)
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- profiles — application-level user data linked to auth.users
-- §16.1, §10.8
-- =========================================================
create table public.profiles (
  id                          uuid primary key references auth.users (id) on delete cascade,
  email                       text not null,
  full_name                   text,
  company_name                text,
  plan                        text not null default 'trial'
    check (plan in ('trial', 'starter', 'growth', 'pro', 'cancelled', 'payment_failed')),
  currency                    text not null default 'USD'
    check (currency in ('USD', 'KES', 'EUR', 'GBP')),
  payment_method              text
    check (payment_method is null or payment_method in ('stripe', 'mpesa', 'kcb')),
  mpesa_phone                 text,
  stripe_customer_id          text,
  stripe_subscription_id      text,
  stripe_current_period_end   timestamptz,
  subscription_renewal_date   date,
  last_payment_reference      text,
  welcome_report_sent         boolean not null default false,
  trial_started_at            timestamptz,
  subscribed_at               timestamptz,
  cancelled_at                timestamptz,
  white_label_enabled         boolean not null default false,
  white_label_domain          text,
  white_label_domain_verified boolean not null default false,
  white_label_sender_name     text,
  white_label_logo_url        text,
  white_label_footer_text     text,
  slack_webhook_url           text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- =========================================================
-- competitors — §16.1, §7.5
-- =========================================================
create table public.competitors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 100),
  website_url text not null,
  notes       text check (notes is null or char_length(notes) <= 500),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index competitors_user_id_active_idx
  on public.competitors (user_id)
  where is_active = true;

-- =========================================================
-- reports — §16.1
-- =========================================================
create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  report_type   text not null
    check (report_type in ('welcome', 'weekly', 'daily', 'battlecard')),
  status        text not null default 'pending'
    check (status in ('pending', 'generated', 'delivered', 'failed')),
  content       jsonb,
  email_subject text,
  delivered_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index reports_user_id_created_at_idx
  on public.reports (user_id, created_at desc);

-- =========================================================
-- report_competitors — link table, §16.1
-- The competitor FK has no ON DELETE so historical reports keep
-- their competitor associations even if the competitor row is
-- deleted (§7.4 acceptance criterion).
-- =========================================================
create table public.report_competitors (
  report_id      uuid not null references public.reports (id) on delete cascade,
  competitor_id  uuid not null references public.competitors (id),
  scrape_limited boolean not null default false,
  primary key (report_id, competitor_id)
);

create index report_competitors_competitor_id_idx
  on public.report_competitors (competitor_id);

-- =========================================================
-- report_errors — operator-only, §16.1
-- =========================================================
create table public.report_errors (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles (id) on delete set null,
  report_type   text,
  error_message text not null,
  error_detail  jsonb,
  created_at    timestamptz not null default now()
);

create index report_errors_user_id_idx on public.report_errors (user_id);
create index report_errors_created_at_idx on public.report_errors (created_at desc);

-- =========================================================
-- battlecards — §16.1, §14
-- =========================================================
create table public.battlecards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  content       jsonb not null,
  generated_at  timestamptz not null default now()
);

create index battlecards_user_id_idx on public.battlecards (user_id);
create index battlecards_competitor_id_idx on public.battlecards (competitor_id);

-- =========================================================
-- api_keys — Pro tier programmatic access, §16.1, §15.3
-- Plaintext keys are NEVER stored. key_hash is sha-256.
-- =========================================================
create table public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  key_hash     text not null unique,
  key_prefix   text not null,
  label        text,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);

create index api_keys_user_id_active_idx
  on public.api_keys (user_id)
  where revoked_at is null;

create index api_keys_key_hash_active_idx
  on public.api_keys (key_hash)
  where revoked_at is null;

-- =========================================================
-- stripe_events — webhook idempotency, §21.5
-- =========================================================
create table public.stripe_events (
  event_id     text primary key,
  event_type   text not null,
  processed_at timestamptz not null default now()
);

-- =========================================================
-- Triggers
-- =========================================================

-- Maintain updated_at on row updates.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger competitors_set_updated_at
before update on public.competitors
for each row execute function public.set_updated_at();

-- Auto-create a profile row when an auth.users row is inserted.
-- This is server-side (security definer) because anon callers cannot insert
-- into auth.users directly — Supabase Auth does, and the trigger runs in its
-- transaction. The webhook to n8n for welcome-report kickoff is wired
-- separately in M2 (PRD §6.2).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, trial_started_at)
  values (new.id, new.email, now());
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================================================
-- Grants
--
-- Newer Supabase does not auto-expose tables to the API roles. We grant
-- broadly here; RLS is the actual access-control surface (service_role
-- bypasses RLS; anon/authenticated are filtered by the policies in the
-- companion RLS migration).
-- =========================================================
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
