-- Referral programme (m22, PRD §23 Week 20).
-- Growth+ and Pro users each get one shareable referral code.
-- A referral row is created when a referred user confirms their email; it is
-- converted when they complete their first paid checkout.

-- =========================================================
-- referral_codes — one row per referrer (created on demand).
-- =========================================================
create table public.referral_codes (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  code       text not null unique
               check (length(code) = 8 and code ~ '^[A-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

alter table public.referral_codes enable row level security;

-- Growth+/Pro users can see their own code (to copy the link in the UI).
create policy referral_codes_select_own
  on public.referral_codes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- INSERT is server-only (generated via service role when the user first opens
-- the referral section). No authenticated insert policy.

-- =========================================================
-- referrals — one row per referred user.
-- =========================================================
create table public.referrals (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references public.profiles (id) on delete cascade,
  referred_id  uuid not null unique references public.profiles (id) on delete cascade,
  converted_at timestamptz,       -- set when the referred user first pays
  created_at   timestamptz not null default now()
);

alter table public.referrals enable row level security;

-- Referrers can read the referrals they generated (to track their count/conversions).
create policy referrals_select_own
  on public.referrals
  for select
  to authenticated
  using ((select auth.uid()) = referrer_id);

-- INSERT and UPDATE are service-role only.

-- =========================================================
-- Index helpers
-- =========================================================
create index referrals_referrer_id_idx on public.referrals (referrer_id);
create index referral_codes_code_idx   on public.referral_codes (code);
