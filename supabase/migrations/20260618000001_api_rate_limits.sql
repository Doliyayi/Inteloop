-- =========================================================
-- api_rate_limits — fixed-window rate limiting for the public API
-- Source: docs/inteloop-prd.md §15.2 (100 requests/min per API key).
--
-- One row per (api_key, 1-minute window). increment_api_rate_limit() does an
-- atomic upsert+increment and returns the new count, so concurrent requests
-- across serverless instances are counted correctly.
-- =========================================================

create table public.api_rate_limits (
  key_id       uuid not null references public.api_keys (id) on delete cascade,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key_id, window_start)
);

create index api_rate_limits_window_idx on public.api_rate_limits (window_start);

-- Atomically bump the counter for a key's current window and return the count.
create or replace function public.increment_api_rate_limit(
  p_key_id uuid,
  p_window_start timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.api_rate_limits (key_id, window_start, count)
  values (p_key_id, p_window_start, 1)
  on conflict (key_id, window_start)
    do update set count = api_rate_limits.count + 1
  returning count into new_count;
  return new_count;
end;
$$;

alter table public.api_rate_limits enable row level security;
-- No policies = service_role only.

grant all on public.api_rate_limits to anon, authenticated, service_role;
