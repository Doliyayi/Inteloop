-- =========================================================
-- api_usage — cost monitoring for upstream API calls
-- Source: docs/inteloop-prd.md §22.4 ("Log all Claude API calls with
-- token counts ... for cost monitoring."). Used by every adapter
-- (Claude, Firecrawl, Brave, Resend) — not just Claude.
-- =========================================================

create table public.api_usage (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles (id) on delete set null,
  provider       text not null
    check (provider in ('claude', 'firecrawl', 'brave', 'resend')),
  call_type      text not null,
  model          text,
  input_tokens   int,
  output_tokens  int,
  status         text not null
    check (status in (
      'success', 'failed', 'rate_limited', 'timeout',
      'invalid_json', 'context_length', 'blocked', 'outage', 'auth', 'unknown'
    )),
  error_detail   jsonb,
  created_at     timestamptz not null default now()
);

create index api_usage_created_at_idx on public.api_usage (created_at desc);
create index api_usage_user_id_idx on public.api_usage (user_id);
create index api_usage_provider_created_at_idx
  on public.api_usage (provider, created_at desc);

alter table public.api_usage enable row level security;
-- No policies = service_role only.

-- Grants for newly created tables (the initial schema migration's
-- ALL TABLES grant is a one-time snapshot and does not apply to
-- tables created in later migrations).
grant all on public.api_usage to anon, authenticated, service_role;
