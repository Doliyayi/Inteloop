# Inteloop — Project Guide

Self-serve B2B SaaS delivering weekly competitor intelligence reports.
Authoritative spec: `docs/inteloop-prd.md`.

## Stack

- Next.js 14 (App Router) on Vercel
- Supabase (Postgres + Auth + RLS)
- n8n (self-hosted) for cron and workflow orchestration
- Claude API for report generation
- Resend (email), Stripe (cards), Safaricom Daraja (Mpesa), KCB Open Banking

## Commands

- `pnpm dev` — local dev server
- `pnpm build` — production build
- `pnpm typecheck` — strict TS check, must pass before commit
- `pnpm lint` — ESLint
- `pnpm test` — Vitest (watch); `pnpm test:run` for one-shot
- `pnpm test:db` — RLS / DB integration tests (requires local Supabase running)
- `pnpm test:e2e` — Playwright
- `pnpm db:start` / `pnpm db:stop` / `pnpm db:reset` / `pnpm db:status` — local Supabase via the CLI
- `pnpm format` — Prettier

## Local Supabase

`pnpm db:start` boots Postgres + Auth + Kong in Docker and applies every migration in `supabase/migrations/`. Get the local keys with `supabase status -o env` and place them in `.env.test.local` (gitignored) before running `pnpm test:db`.

## Layering

- `src/app/` — Next.js routes (UI + API route handlers only, no business logic)
- `src/lib/` — domain modules (auth, billing, reports, integrations)
- `src/lib/db/` — Supabase client + typed queries (server-only)
- `src/components/` — shared UI
- `supabase/migrations/` — SQL migrations, single source of truth for schema

## Conventions

- Validate every API route input with Zod. No untrusted data crosses a function boundary.
- All DB access goes through the typed query layer — never call `supabase` directly from a route.
- RLS is enforced on every table. Service-role key is server-only; never reference in client bundles.
- Webhook handlers must verify signatures (`stripe.webhooks.constructEvent`, Daraja IP allowlist, etc.) before any state change.
- API keys are stored as SHA-256 hashes only — never log or persist plaintext.

## Do not touch without explicit instruction

- `supabase/migrations/` history (write new migrations; never edit applied ones)
- Webhook signature verification
- RLS policies
- API key hashing logic

## Notes

- Node 20 LTS pinned via `.nvmrc`
- pnpm only; do not introduce npm or yarn lockfiles
