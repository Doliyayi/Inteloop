-- =========================================================
-- White-label custom sender domain — DNS verification (PRD §13.3)
-- Adds the Resend domain id + a timestamp so the verification cron can poll
-- for up to 24 hours after the domain is registered.
-- =========================================================

alter table public.profiles add column white_label_domain_id       text;
alter table public.profiles add column white_label_domain_added_at timestamptz;
