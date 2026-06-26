-- Adds is_operator flag to profiles for operator dashboard access (m21).
-- Source: docs/inteloop-prd.md §5 (Platform Operator role), §23 Week 19.
--
-- Security: authenticated users cannot self-promote via the API.
-- The column may only be toggled by a service-role connection (e.g., direct
-- SQL in the Supabase dashboard). The trigger below enforces this by raising
-- an exception if a JWT-authenticated request attempts to change the value.

alter table public.profiles
  add column is_operator boolean not null default false;

-- =========================================================
-- =========================================================
-- Retention cohort function — operator dashboard (§23 Week 19)
-- =========================================================
-- Returns one row per subscription-start cohort week.
-- Week-1 / Week-4 columns are NULL for cohorts not yet old enough.
-- Anchored to subscribed_at (paid conversion), not trial start.
create or replace function public.retention_cohorts()
  returns table (
    cohort_week       timestamptz,
    total_subscribers bigint,
    retained_week_1   bigint,
    retained_week_4   bigint
  )
  language sql
  security definer
  stable
as $$
  select
    date_trunc('week', subscribed_at) as cohort_week,
    count(*)                          as total_subscribers,
    case
      when date_trunc('week', subscribed_at) <= now() - interval '7 days'
      then count(*) filter (
        where cancelled_at is null
           or cancelled_at > subscribed_at + interval '7 days'
      )
      else null
    end                               as retained_week_1,
    case
      when date_trunc('week', subscribed_at) <= now() - interval '28 days'
      then count(*) filter (
        where cancelled_at is null
           or cancelled_at > subscribed_at + interval '28 days'
      )
      else null
    end                               as retained_week_4
  from public.profiles
  where subscribed_at is not null
  group by cohort_week
  order by cohort_week desc;
$$;

-- Revoke public execute; only service_role connections call this.
revoke execute on function public.retention_cohorts() from public;

-- =========================================================
-- Trigger: prevent API callers from toggling is_operator
-- =========================================================
create or replace function public.profiles_lock_operator_flag()
  returns trigger
  language plpgsql
as $$
begin
  if old.is_operator is distinct from new.is_operator
     and current_setting('request.jwt.claim.role', true) = 'authenticated'
  then
    raise exception 'is_operator is read-only via the API';
  end if;
  return new;
end;
$$;

create trigger profiles_lock_operator_flag
  before update of is_operator on public.profiles
  for each row
  execute function public.profiles_lock_operator_flag();
