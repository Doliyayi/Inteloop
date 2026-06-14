-- Add 'bounce' to api_usage.status to record Resend 4xx (bad address)
-- responses per PRD §21.3 distinctly from generic 'failed'.
alter table public.api_usage drop constraint if exists api_usage_status_check;
alter table public.api_usage
  add constraint api_usage_status_check
  check (status in (
    'success', 'failed', 'rate_limited', 'timeout',
    'invalid_json', 'context_length', 'blocked', 'outage',
    'auth', 'bounce', 'unknown'
  ));
