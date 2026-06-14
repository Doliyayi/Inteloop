-- =========================================================
-- Row Level Security policies
-- Source of truth: docs/inteloop-prd.md §16.2 (+ §22.2)
--
-- Conventions:
--   - The service_role connection bypasses RLS (Supabase default),
--     so server-side workflows (webhooks, n8n) can write freely.
--   - All authenticated user access is restricted to rows owned by
--     auth.uid() — verified by tests/db/rls.test.ts.
--   - Tables with no policies are implicitly closed: no role except
--     service_role can read or write them.
-- =========================================================

-- =========================================================
-- profiles — users read/update own row only.
-- INSERT is performed by the on_auth_user_created trigger;
-- end users cannot directly insert profiles.
-- DELETE cascades from auth.users; no end-user delete policy.
-- =========================================================
alter table public.profiles enable row level security;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- =========================================================
-- competitors — users full CRUD on own rows.
-- =========================================================
alter table public.competitors enable row level security;

create policy competitors_select_own
  on public.competitors
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy competitors_insert_own
  on public.competitors
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy competitors_update_own
  on public.competitors
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy competitors_delete_own
  on public.competitors
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- =========================================================
-- reports — users read own only. Writes are server-only.
-- =========================================================
alter table public.reports enable row level security;

create policy reports_select_own
  on public.reports
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- =========================================================
-- report_competitors — users read rows whose parent report is theirs.
-- Writes are server-only.
-- =========================================================
alter table public.report_competitors enable row level security;

create policy report_competitors_select_via_report
  on public.report_competitors
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.reports r
      where r.id = report_competitors.report_id
        and r.user_id = (select auth.uid())
    )
  );

-- =========================================================
-- battlecards — users read and delete own only.
-- INSERT and UPDATE are server-only.
-- =========================================================
alter table public.battlecards enable row level security;

create policy battlecards_select_own
  on public.battlecards
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy battlecards_delete_own
  on public.battlecards
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- =========================================================
-- api_keys — users full CRUD on own keys.
-- The plaintext key was never persisted; key_hash is the only stored form.
-- =========================================================
alter table public.api_keys enable row level security;

create policy api_keys_select_own
  on public.api_keys
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy api_keys_insert_own
  on public.api_keys
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy api_keys_update_own
  on public.api_keys
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy api_keys_delete_own
  on public.api_keys
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- =========================================================
-- report_errors — service role only. No policies = no access for any
-- non-service-role caller.
-- =========================================================
alter table public.report_errors enable row level security;

-- =========================================================
-- stripe_events — service role only.
-- =========================================================
alter table public.stripe_events enable row level security;
