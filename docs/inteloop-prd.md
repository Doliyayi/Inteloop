# Inteloop — Product Requirements Document

**Product:** Inteloop Competitor Intelligence Platform  
**Document version:** 1.0  
**Date:** June 2026  
**Prepared by:** Riverbank Solutions  
**Status:** For Development

---

## 1. Document Purpose

This document defines the full product requirements for Inteloop — a self-serve SaaS competitor intelligence platform. It is the primary specification for the development team covering all three product phases: MVP launch, agency channel growth, and tier expansion.

Developers should treat this document as the authoritative source of truth for what to build. Every feature includes user stories, acceptance criteria, data model definitions, API contracts, and error handling rules. Where behaviour is ambiguous, default to the most conservative interpretation and raise with the product owner before implementing.

---

## 2. Product Vision

Inteloop delivers weekly automated competitor intelligence to B2B marketing teams and digital agencies. The platform monitors competitor websites and public news, runs Claude AI analysis, and emails a structured briefing every Monday morning.

The business model is fully self-serve: customers sign up, onboard, receive an immediate welcome report, and subscribe to a recurring weekly service — all without operator involvement.

---

## 3. Success Metrics

| Metric | Target |
|--------|--------|
| Monthly Recurring Revenue | $8,020/month |
| Paying customers (Starter tier) | 45 |
| Week-1 retention | 80%+ |
| Week-4 retention | 89%+ |
| Welcome report delivery time | < 60 minutes from signup |
| Weekly report delivery time | Monday 6 AM ± 30 minutes |
| Infrastructure cost per customer | < $3/month |

---

## 4. System Architecture Overview

### 4.1 Component Map

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 14 (App Router) on Vercel | Customer-facing web app |
| Authentication | Supabase Auth | Email/password sign-up, session management, webhooks |
| Database | Supabase (managed Postgres) | All application data |
| Automation engine | n8n (self-hosted, DigitalOcean) | Welcome report trigger, weekly cron |
| AI analysis | Claude API (Anthropic) | Report generation — 100% of AI processing |
| Web scraping | Firecrawl | Competitor website content extraction |
| News intelligence | Brave Search API | News, press releases, public announcements |
| Email delivery | Resend | Transactional email (reports + sequences) |
| Payments | Stripe Billing + Stripe Customer Portal | Subscriptions, trials, self-serve cancellation |
| Analytics | Plausible | Web and app traffic (privacy-friendly) |
| Alerting | Slack webhooks via n8n | Major competitive change notifications |

### 4.2 Request Flow — Weekly Report

```
n8n cron (Monday 6 AM)
  → fetch all active subscribers from Supabase
  → for each subscriber:
      → fetch competitor list from Supabase
      → Brave Search: last 7 days news per competitor
      → Firecrawl: homepage + /about + /pricing per competitor
      → Claude API: generate weekly report (weekly prompt)
      → Resend: send formatted email report
      → if major change detected: Slack webhook
      → Supabase: log report_id, status, timestamp
```

### 4.3 Request Flow — Welcome Report

```
Supabase Auth webhook (new user event)
  → n8n webhook trigger
    → wait up to 10 minutes for competitor list
    → if no competitors submitted: send reminder email, exit
    → Brave Search: last 30 days news per competitor
    → Firecrawl: homepage + /about + /pricing per competitor
    → Claude API: generate welcome report (welcome prompt)
    → Resend: deliver welcome report
    → Supabase: log report, update user state (welcome_report_sent: true)
```

---

## 5. User Roles

| Role | Description | Access |
|------|-------------|--------|
| Subscriber | Individual customer on any paid plan | Own account, competitors, reports |
| Agency Admin | Growth/Pro customer using white-label | All subscriber features + white-label config |
| Platform Operator | Internal (product owner) | Admin dashboard, all data |

---

## 6. Authentication and Account Management

### 6.1 User Stories

- As a visitor, I can create an account using my email and password so that I can start my free trial.
- As a user, I can log in to my account and be redirected to my dashboard.
- As a user, I can reset my password via a link sent to my email.
- As a user, I can update my email address and password in account settings.
- As a user, I can delete my account, which cancels any active subscription and anonymises my data.

### 6.2 Implementation

Authentication is handled entirely by Supabase Auth. Do not build a custom auth system.

Supabase Auth must be configured to:

1. Enable email/password sign-up
2. Require email confirmation before the account is active (prevents junk signups triggering report generation)
3. Fire a `user.created` webhook to the n8n endpoint on new confirmed user creation
4. Generate a password reset email via Supabase's built-in flow (use Resend as the SMTP provider)

### 6.3 Acceptance Criteria

- A user who submits an invalid email format receives an inline validation error before form submission.
- A user who signs up with an already-registered email receives the message: "An account with this email already exists."
- After sign-up, the user receives a confirmation email and sees: "Check your email to confirm your account."
- The `user.created` webhook fires only after email confirmation, not on initial sign-up.
- Password reset emails are delivered within 2 minutes.
- A user who deletes their account is immediately logged out and cannot log back in.

### 6.4 Database: `users` table extension

Supabase Auth manages the `auth.users` table. Create a public `profiles` table linked by user ID for application-level data.

```
profiles
  id                    uuid PRIMARY KEY REFERENCES auth.users(id)
  email                 text NOT NULL
  full_name             text
  company_name          text
  plan                  text DEFAULT 'trial'   -- trial | starter | growth | pro | cancelled
  stripe_customer_id    text
  stripe_subscription_id text
  welcome_report_sent   boolean DEFAULT false
  trial_started_at      timestamptz
  subscribed_at         timestamptz
  cancelled_at          timestamptz
  white_label_enabled   boolean DEFAULT false
  created_at            timestamptz DEFAULT now()
  updated_at            timestamptz DEFAULT now()
```

---

## 7. Onboarding and Competitor Submission

### 7.1 User Stories

- As a new user, after confirming my email, I am taken to an onboarding form where I can submit my competitors.
- As a user, I can submit up to 3 competitors on the Starter plan (name + website URL).
- As a user, I can add, edit, and remove competitors from my account at any time.
- As a user, if I do not submit competitors immediately, I receive a reminder email within 10 minutes.

### 7.2 Onboarding Form Fields

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| Competitor name | text | 2–100 characters | Yes |
| Competitor website URL | url | Must be a valid https:// URL | Yes |
| Notes (optional) | textarea | Max 500 characters | No |

The form allows adding multiple competitors (up to the plan limit) before submitting.

### 7.3 Plan Competitor Limits

| Plan | Competitor limit |
|------|-----------------|
| Trial / Starter | 3 |
| Growth | 8 |
| Pro | 15 |

### 7.4 Acceptance Criteria

- A user who submits a competitor with an invalid URL sees: "Please enter a valid URL including https://"
- A Starter user who tries to add a 4th competitor sees: "Your plan includes up to 3 competitors. Upgrade to Growth to track up to 8."
- Competitor edits are reflected in the next weekly report cycle.
- Deleting a competitor does not delete historical reports that included it.
- After submitting competitors, the user sees: "Your welcome report is being generated. Expect it in your inbox within 60 minutes."

### 7.5 Database: `competitors` table

```
competitors
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  name            text NOT NULL
  website_url     text NOT NULL
  notes           text
  is_active       boolean DEFAULT true
  created_at      timestamptz DEFAULT now()
  updated_at      timestamptz DEFAULT now()
```

---

## 8. Welcome Report

### 8.1 User Stories

- As a new user, I receive a welcome report email within 60 minutes of submitting my competitors.
- As a new user, the welcome report contains a snapshot of each competitor I submitted.
- As a new user, the report ends with a clear statement that the full weekly analysis begins next Monday.

### 8.2 Report Sections

| Section | Content | Data Source |
|---------|---------|-------------|
| Competitor snapshot | 1-paragraph profile: positioning, current focus, market presence | Firecrawl (homepage + /about) |
| Last 30 days in the news | Press coverage, product launches, funding, executive hires | Brave Search |
| Website signals | Key messaging observations, pricing visibility, new feature listings | Firecrawl |
| What to watch | 2–3 forward-looking signals Claude flags as worth monitoring | Claude synthesis |
| What's coming Monday | Explanation of what the full weekly report adds | Static copy |

The closing line of every welcome report must be: **"This is your baseline. Every Monday we'll show you what changed."**

### 8.3 n8n Workflow Specification

**Trigger:** POST webhook from Supabase Auth `user.created` event.

**Webhook payload:**

```json
{
  "type": "INSERT",
  "table": "profiles",
  "record": {
    "id": "uuid",
    "email": "string",
    "created_at": "timestamp"
  }
}
```

**Workflow steps:**

1. **Wait node** — poll Supabase every 2 minutes for up to 10 minutes checking `competitors` table for records matching `user_id`.
2. **Branch** — if no competitors after 10 minutes: send "remind me to add competitors" email via Resend, end workflow.
3. **Brave Search node** — for each competitor: query `{competitor name} news` with `freshness=pm` (past month). Extract top 5 results (title, snippet, URL, date).
4. **Firecrawl node** — for each competitor: scrape homepage, /about, /pricing. Extract markdown content. If response < 200 words: flag competitor as `scrape_limited = true`, do not retry.
5. **Claude API node** — send all gathered data to Claude with the welcome report prompt. See Section 15 for prompt specification.
6. **Quality check** — if any competitor section is < 100 words: add disclaimer "Limited data available for [Competitor]" to that section. Never send an empty section.
7. **Resend node** — send formatted HTML email to user. Subject: *"Your competitor baseline is ready — [Competitor 1], [Competitor 2]..."*
8. **Supabase update** — set `profiles.welcome_report_sent = true`, insert record into `reports` table.

### 8.4 Acceptance Criteria

- Welcome report email is delivered within 60 minutes of competitor submission for 95%+ of users.
- If Firecrawl returns < 200 words for a competitor, the section is marked with a note — it is never sent as a blank section.
- A user who submits competitors 3 hours after sign-up (outside the 10-minute wait window) still receives a welcome report when the next check runs. (Implement a fallback: check for users with `welcome_report_sent = false` and competitors present but no report generated, run hourly.)
- `profiles.welcome_report_sent` is set to `true` after successful email delivery, not after API call completion.

---

## 9. Weekly Report

### 9.1 User Stories

- As a subscriber, I receive a full competitor intelligence report every Monday at approximately 6 AM.
- As a subscriber, the report shows what changed for each competitor in the past 7 days.
- As a subscriber, I receive a Slack notification if a major competitive change is detected.
- As a subscriber, I can view all past reports in my dashboard.

### 9.2 Report Sections

| Section | Content | Data Source |
|---------|---------|-------------|
| Executive summary | 3–5 bullet summary of the most important changes across all competitors | Claude synthesis |
| Per-competitor analysis | Change detection, news, messaging updates, trend commentary | Brave Search + Firecrawl + Claude |
| Week-on-week delta | Explicit comparison: "Last week X, this week Y" for each competitor | Firecrawl diff + Claude |
| Strategic implications | What these changes mean for the subscriber's positioning | Claude synthesis |
| Signals to watch | 2–3 items to monitor in the coming week | Claude synthesis |

### 9.3 n8n Workflow Specification

**Trigger:** Cron, every Monday at 06:00 UTC.

**Workflow steps:**

1. **Supabase query** — fetch all profiles where `plan IN ('starter', 'growth', 'pro')` and `cancelled_at IS NULL`.
2. **Loop** — for each subscriber:

   a. Fetch competitor list from `competitors` table where `user_id = subscriber.id AND is_active = true`.

   b. **Brave Search** — for each competitor: query `{name} site:{domain} OR "{name}" news` with `freshness=pw` (past week). Top 5 results.

   c. **Firecrawl** — homepage + /about + /pricing per competitor. Flag if < 200 words.

   d. **Supabase fetch previous report** — retrieve the most recent `report_content` for this user to enable week-on-week comparison.

   e. **Claude API** — generate weekly report using the weekly prompt. Pass current scraped data + previous report summary.

   f. **Major change detection** — if Claude flags `major_change: true` in its response: fire Slack webhook with summary.

   g. **Resend** — send report email. Subject: *"Your weekly competitor report — [date]"*

   h. **Supabase** — insert into `reports` table with full content, status, delivery timestamp.

3. **Error handling** — if any individual subscriber's workflow errors: log to `report_errors` table, continue loop. Do not fail the entire batch.

### 9.4 Pro Plan: Daily Briefing

For `plan = 'pro'`, trigger an additional lightweight cron Monday–Friday at 07:00 UTC. The daily briefing is a condensed version of the weekly report — news only, no Firecrawl scraping (cost control). Use the daily briefing Claude prompt.

### 9.5 Acceptance Criteria

- Every active subscriber receives a report email by 07:00 UTC every Monday.
- Reports are personalised — each subscriber's email contains only their tracked competitors.
- A Slack notification fires only when Claude explicitly returns `major_change: true` — not on every report.
- If a subscriber added or removed a competitor during the week, the change is reflected in that Monday's report.
- Previous week's report content is included in the Claude context (as a summary, not full text) to enable delta analysis.
- Failed individual deliveries are logged to `report_errors` and do not affect other subscribers' deliveries.

---

## 10. Subscription and Billing

### 10.1 User Stories

- As a trial user, I receive a subscription prompt after receiving my first full weekly report.
- As a user, I can subscribe to a plan without contacting support.
- As a subscriber, I can upgrade, downgrade, or cancel my subscription through the self-service portal.
- As a subscriber, I am notified by email if my payment fails.
- As a cancelled subscriber, I continue to have access until the end of my billing period.
- As a user in Kenya, I can pay via Mpesa (Safaricom) using STK Push without needing a credit card.
- As a user in Kenya, I can pay via Lipa na KCB without needing a credit card.

### 10.2 Plan Definitions

| Plan | Monthly (USD) | Monthly (KES) | Annual (USD) | Competitors | Cadence | Features |
|------|-------------|--------------|-------------|-------------|---------|---------|
| Starter | $197 | KES 25,500 | $1,970 | 3 | Weekly | Email report, Slack alerts, report history |
| Growth | $397 | KES 51,400 | $3,970 | 8 | Weekly + real-time alerts | White-label reports, custom sender domain |
| Pro | $797 | KES 103,100 | $7,970 | 15 | Daily briefing | White-label, battlecard generation, API access |

KES pricing is indicative and should be reviewed at launch against the prevailing exchange rate. Store the functional currency per subscriber in `profiles.currency` (`USD` or `KES`). KES prices are billed via the mobile money gateway, not Stripe.

### 10.3 Free Trial Mechanics

| Stage | Timing | Requires payment |
|-------|--------|-----------------|
| Welcome report | D0 — within 60 min of signup | No |
| Pre-Monday teaser email | D5 | No |
| First full weekly report | D6 (Monday) | No |
| Subscription prompt | D7 | Yes — Stripe or mobile money checkout |

Stripe trial mechanics: set `trial_end` to 8 days from signup. The first charge runs on day 8 if the customer has entered payment details. If no card entered, subscription does not activate.

Mobile money trial mechanics: mobile money does not support subscription pre-authorisation. On day 7, send the conversion prompt with a "Pay now" link that initiates a one-time STK Push or Lipa na KCB checkout. On payment confirmation, create the subscription record and set `subscribed_at`.

### 10.4 Payment Methods Overview

Inteloop supports two payment channels. The channel is selected at checkout based on the user's preferred currency and location.

| Channel | Provider | Currencies | Methods |
|---------|----------|------------|---------|
| Card / international | Stripe | USD, EUR, GBP | Visa, Mastercard, AmEx |
| Mobile money (Kenya) | Safaricom Daraja API | KES | Mpesa STK Push |
| Mobile money (Kenya) | KCB Lipa na KCB API | KES | Lipa na KCB |

The checkout page detects the user's preferred currency from their profile (`profiles.currency`). KES users are routed to the mobile money checkout. USD users are routed to Stripe. Users can manually switch channels at checkout.

### 10.5 Stripe Integration Requirements

**Products and Prices to configure in Stripe:**

- `prod_starter_monthly`, `prod_starter_annual`
- `prod_growth_monthly`, `prod_growth_annual`
- `prod_pro_monthly`, `prod_pro_annual`

**Customer Portal:** Enable the Stripe Customer Portal with permissions for: plan upgrade/downgrade, cancellation (immediate or end-of-period), invoice history, payment method update.

**Webhooks to handle:**

| Stripe event | Action |
|-------------|--------|
| `checkout.session.completed` | Set `profiles.plan`, `stripe_subscription_id`, `subscribed_at` |
| `customer.subscription.updated` | Update plan field if user upgraded/downgraded |
| `customer.subscription.deleted` | Set `profiles.plan = 'cancelled'`, `cancelled_at = now()` |
| `invoice.payment_failed` | Send dunning email via Resend; set `profiles.plan = 'payment_failed'` |
| `invoice.payment_succeeded` | Clear `payment_failed` flag if previously set |

### 10.6 Mpesa Integration (Safaricom Daraja API)

**API:** Safaricom Daraja API v2 — Lipa na Mpesa STK Push (also called M-Pesa Express).

**Payment flow:**

1. User selects Mpesa at checkout and enters their Safaricom phone number.
2. The backend calls `POST /mpesa/stkpush/v1/processrequest` with the amount and phone number.
3. Safaricom sends an STK Push prompt to the user's phone. The user enters their Mpesa PIN.
4. Safaricom calls the registered callback URL (`/api/webhooks/mpesa`) with the payment result.
5. On success: create or renew the subscription record in Supabase, set `profiles.plan`, send confirmation email.
6. On failure or timeout (user ignored the prompt): notify the user and allow retry.

**Subscription handling for Mpesa:** Mpesa does not support automatic recurring billing. Each renewal must be triggered manually as a new STK Push. Implement a recurring billing job in n8n:

- Cron: run on the 1st of each month for all `profiles.payment_method = 'mpesa'` subscribers whose `subscription_renewal_date <= today`.
- Trigger STK Push for the renewal amount.
- If payment not confirmed within 24 hours: send reminder email and SMS (via Africa's Talking or Safaricom SMS API).
- If not confirmed within 72 hours: suspend access, send final notice.

**Required Daraja credentials:**

- Consumer Key and Consumer Secret (from Safaricom Developer Portal)
- Business Short Code (Paybill or Till number)
- Passkey (for STK Push)
- Callback URL (must be a publicly accessible HTTPS endpoint)

**Daraja API environments:**

- Sandbox: `https://sandbox.safaricom.co.ke`
- Production: `https://api.safaricom.co.ke`

Test all flows in sandbox before going live. Safaricom sandbox uses test phone number `254708374149` and PIN `12345`.

### 10.7 Lipa na KCB Integration (KCB Bank Kenya)

**API:** KCB Open Banking API — Lipa na KCB (bill payment and collection).

**Payment flow:**

1. User selects Lipa na KCB at checkout.
2. The backend calls the KCB payment initiation endpoint with the amount, account reference, and callback URL.
3. KCB sends a push notification or USSD prompt to the user's registered KCB mobile banking account.
4. User authorises the payment in the KCB app or via USSD.
5. KCB calls the registered callback URL (`/api/webhooks/kcb`) with the transaction result.
6. On success: create or renew the subscription record, set `profiles.plan`, send confirmation email.

**Subscription handling for Lipa na KCB:** Like Mpesa, Lipa na KCB does not support automatic recurring debit without explicit per-transaction authorisation. Use the same n8n renewal cron as Mpesa — trigger a new payment initiation request on the renewal date.

**Integration prerequisites:**

- Register as a merchant on KCB Open Banking Portal.
- Obtain API key, merchant code, and callback secret.
- KCB will provide sandbox credentials for testing.

**Note:** KCB Open Banking API documentation changes periodically. Verify the current endpoint specification directly with KCB's developer support before implementation. Do not implement based on third-party documentation alone.

### 10.8 Mobile Money Database Fields

Add the following fields to the `profiles` table:

```sql
ALTER TABLE profiles ADD COLUMN currency             text NOT NULL DEFAULT 'USD';
ALTER TABLE profiles ADD COLUMN payment_method       text;  -- 'stripe' | 'mpesa' | 'kcb' | null
ALTER TABLE profiles ADD COLUMN mpesa_phone          text;  -- Safaricom number for STK Push
ALTER TABLE profiles ADD COLUMN subscription_renewal_date date;
ALTER TABLE profiles ADD COLUMN last_payment_reference text; -- Mpesa/KCB transaction ID
```

### 10.9 Webhook Endpoints for Mobile Money

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/webhooks/mpesa` | Receive Daraja STK Push callback |
| POST | `/api/webhooks/kcb` | Receive KCB Lipa na KCB payment callback |

Both endpoints must validate the callback against a shared secret or IP allowlist (Safaricom and KCB provide fixed callback IP ranges). Return HTTP 200 immediately — do not block on processing. Process the payment asynchronously via a Supabase queue or n8n webhook node.

**Mpesa callback payload (Daraja STK Push result):**

```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "string",
      "CheckoutRequestID": "string",
      "ResultCode": 0,
      "ResultDesc": "The service request is processed successfully.",
      "CallbackMetadata": {
        "Item": [
          {"Name": "Amount", "Value": 25500},
          {"Name": "MpesaReceiptNumber", "Value": "NLJ7RT61SV"},
          {"Name": "PhoneNumber", "Value": 254712345678}
        ]
      }
    }
  }
}
```

`ResultCode = 0` means success. Any other code is a failure — log the `ResultDesc` and notify the user.

### 10.10 Access Control After Cancellation

After cancellation, the user retains full access until `current_period_end` (Stripe) or `subscription_renewal_date` (mobile money). On that date, set `profiles.plan = 'cancelled'` and block report generation and dashboard access. Show a reactivation prompt instead of the dashboard.

### 10.11 Acceptance Criteria

- A user cannot access the dashboard if `profiles.plan = 'cancelled'` and the access period has expired.
- Stripe Customer Portal is accessible from the dashboard without requiring a support request.
- Plan downgrades take effect at the end of the current billing period — not immediately.
- Plan upgrades take effect immediately.
- A payment failure triggers a dunning email within 1 hour. Three failed payment emails are sent at 1-day, 3-day, and 7-day intervals before subscription is cancelled.
- An Mpesa STK Push that is not confirmed within 30 seconds displays: "Check your phone for the Mpesa prompt. It may take up to 1 minute to arrive."
- An Mpesa payment with `ResultCode != 0` triggers a retry prompt and logs the failure with the `ResultDesc`.
- The Mpesa renewal cron runs independently of the Stripe webhook handler — a Stripe failure does not affect mobile money billing and vice versa.
- A KES subscriber's dashboard shows KES amounts throughout — never USD amounts.

---

## 11. Dashboard and Report History

### 11.1 User Stories

- As a subscriber, I can see a list of all my past reports sorted by date.
- As a subscriber, I can open a full report and read it in the browser.
- As a subscriber, I can manage my tracked competitors (add, edit, remove).
- As a subscriber, I can see my current plan and a link to the billing portal.
- As a subscriber, I can connect a Slack workspace to receive major change alerts.

### 11.2 Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard home | `/dashboard` | Last report summary, competitor list, quick stats |
| Reports | `/dashboard/reports` | Paginated list of all reports |
| Report detail | `/dashboard/reports/[id]` | Full rendered report |
| Competitors | `/dashboard/competitors` | Add/edit/remove tracked competitors |
| Settings | `/dashboard/settings` | Account details, password change |
| Billing | `/dashboard/billing` | Plan info, link to Stripe Customer Portal |
| Integrations | `/dashboard/integrations` | Slack webhook setup |

### 11.3 Report Rendering

Reports are stored as structured JSON in Supabase. The frontend renders them as formatted HTML — do not email raw HTML and re-render it from the email. Store report content in the database and render consistently in both email and dashboard views.

### 11.4 Acceptance Criteria

- The reports list loads within 2 seconds for users with up to 52 historical reports (1 year of weekly reports).
- Report detail pages render correctly on mobile viewports (375px width minimum).
- A user who has not yet received their first report sees an empty state: "Your first report is on its way. Check back Monday morning."
- Competitor changes made on the competitors page display immediately in the UI without a page refresh.

---

## 12. Slack Integration

### 12.1 User Stories

- As a subscriber, I can connect my Slack workspace by pasting an incoming webhook URL.
- As a subscriber, I receive a Slack notification when a major competitive change is detected in my weekly report.

### 12.2 Implementation

Use Slack's Incoming Webhooks (no OAuth required). The user generates a webhook URL in Slack and pastes it into the Inteloop integrations page. Store the webhook URL encrypted in `profiles.slack_webhook_url`.

**Alert trigger condition:** Claude must return a structured `major_change` field in its weekly report response. Define "major" as any of: new product launch, pricing change, executive hire/departure, acquisition, funding announcement, or major messaging shift.

**Slack message format:**

```
🔔 *Inteloop Alert — [Competitor Name]*
*[Change type]*
[1–2 sentence summary of the change]
[Link to full report in Inteloop dashboard]
```

### 12.3 Acceptance Criteria

- An invalid Slack webhook URL (non-Slack domain) is rejected at save time with an inline error.
- A test message is sent to the configured webhook when the user saves the integration.
- Slack alerts fire within 5 minutes of the weekly report being generated.

---

## 13. White-Label Reports (Growth and Pro)

### 13.1 User Stories

- As a Growth subscriber, I can upload my agency logo to replace the Inteloop logo in all reports.
- As a Growth subscriber, I can configure a custom sender domain so reports arrive from my domain, not inteloop.com.
- As a Growth subscriber, my clients receive reports that do not mention Inteloop by name.

### 13.2 White-Label Configuration

| Setting | Description | Validation |
|---------|-------------|------------|
| Agency logo | PNG or SVG, max 2MB | Must be uploaded before white-label can be activated |
| Sender name | Display name in from field (e.g., "Agency Insights") | 2–50 characters |
| Sender domain | e.g., `reports.agencyname.com` | Must be verified via DNS records in Resend |
| Report footer text | Custom footer replacing Inteloop branding | Max 200 characters |

### 13.3 DNS Verification Flow

1. User enters their sender domain in the integrations page.
2. Inteloop calls Resend API to register the domain and retrieve DNS verification records.
3. Display the DNS records to the user with copy buttons.
4. User adds records to their DNS provider.
5. Inteloop polls Resend verification status every 15 minutes for up to 24 hours.
6. When verified, set `profiles.white_label_domain_verified = true` and activate white-label sending.

### 13.4 Acceptance Criteria

- A Growth subscriber cannot enable custom sender domain until DNS records are verified.
- Reports sent from a verified custom domain pass SPF and DKIM checks.
- An agency subscriber's clients see only the agency branding — Inteloop is not mentioned in email headers, report content, or footers.
- If a subscriber downgrades from Growth to Starter, white-label sending is immediately disabled.

---

## 14. Battlecard Generation (Pro)

### 14.1 User Stories

- As a Pro subscriber, I can generate a competitive battlecard for any tracked competitor on demand.
- As a Pro subscriber, a battlecard is automatically included in my weekly report.

### 14.2 Battlecard Format

| Section | Content |
|---------|---------|
| Competitor overview | Name, positioning statement, primary market |
| Strengths | Top 3 strengths from public evidence |
| Weaknesses | Top 3 weaknesses inferred from reviews, job postings, news |
| Pricing | Known pricing tiers or "pricing not public" |
| Key differentiators | How they position against generic alternatives |
| How to win | 3–5 talking points to use when competing against them |
| Landmines | Topics to avoid raising that play to their strengths |

Battlecards are generated by a dedicated Claude prompt optimised for sales enablement rather than monitoring.

### 14.3 Acceptance Criteria

- Battlecard generation can be triggered on-demand from the competitor detail page.
- Generated battlecards are stored in Supabase and accessible from report history.
- Battlecards are exported as PDF on demand.
- A Starter or Growth user who navigates to the battlecard feature sees an upgrade prompt.

---

## 15. API Access (Pro)

### 15.1 User Stories

- As a Pro subscriber, I can generate and manage API keys from my dashboard.
- As a Pro subscriber, I can retrieve my reports programmatically via the Inteloop API.
- As a Pro subscriber, I can submit competitor updates via the API.

### 15.2 API Endpoints

**Authentication:** Bearer token (API key) in `Authorization` header.

**Base URL:** `https://api.inteloop.com/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/reports` | List all reports (paginated, `?page=1&per_page=20`) |
| GET | `/reports/{id}` | Retrieve a single report (full JSON) |
| GET | `/competitors` | List all tracked competitors |
| POST | `/competitors` | Add a competitor `{name, website_url, notes}` |
| PUT | `/competitors/{id}` | Update a competitor |
| DELETE | `/competitors/{id}` | Remove a competitor |
| GET | `/battlecards/{competitor_id}` | Retrieve the latest battlecard for a competitor |
| POST | `/battlecards/{competitor_id}/generate` | Trigger on-demand battlecard generation |

**Rate limits:** 100 requests per minute per API key. Return `429 Too Many Requests` with `Retry-After` header when exceeded.

### 15.3 API Key Management

Store API keys hashed in the database (never store plaintext). Display the key to the user only once at creation time. Allow creation of up to 5 keys per account. Allow key revocation at any time.

```
api_keys
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
  user_id         uuid NOT NULL REFERENCES profiles(id)
  key_hash        text NOT NULL   -- sha256 of the key
  key_prefix      text NOT NULL   -- first 8 chars shown in UI (e.g., "ilp_a3f2")
  label           text
  last_used_at    timestamptz
  created_at      timestamptz DEFAULT now()
  revoked_at      timestamptz
```

### 15.4 Acceptance Criteria

- An API key is displayed to the user exactly once — at creation. It cannot be retrieved again.
- A revoked API key returns `401 Unauthorized` immediately.
- All API responses include `Content-Type: application/json`.
- Pagination responses include `total`, `page`, `per_page`, and `next_page` fields.
- A Starter or Growth user attempting to use the API receives `403 Forbidden` with message: "API access is available on the Pro plan."

---

## 16. Database Schema (Complete)

### 16.1 Tables

```sql
-- Linked to Supabase auth.users
CREATE TABLE profiles (
  id                        uuid PRIMARY KEY REFERENCES auth.users(id),
  email                     text NOT NULL,
  full_name                 text,
  company_name              text,
  plan                      text NOT NULL DEFAULT 'trial',
  stripe_customer_id        text,
  stripe_subscription_id    text,
  stripe_current_period_end timestamptz,
  welcome_report_sent       boolean NOT NULL DEFAULT false,
  trial_started_at          timestamptz,
  subscribed_at             timestamptz,
  cancelled_at              timestamptz,
  white_label_enabled       boolean NOT NULL DEFAULT false,
  white_label_domain        text,
  white_label_domain_verified boolean NOT NULL DEFAULT false,
  white_label_sender_name   text,
  white_label_logo_url      text,
  white_label_footer_text   text,
  slack_webhook_url         text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE competitors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            text NOT NULL,
  website_url     text NOT NULL,
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_type         text NOT NULL,  -- 'welcome' | 'weekly' | 'daily' | 'battlecard'
  status              text NOT NULL DEFAULT 'pending',  -- pending | generated | delivered | failed
  content             jsonb,          -- structured report content
  email_subject       text,
  delivered_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE report_competitors (
  report_id       uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  competitor_id   uuid NOT NULL REFERENCES competitors(id),
  scrape_limited  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (report_id, competitor_id)
);

CREATE TABLE report_errors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES profiles(id),
  report_type     text,
  error_message   text NOT NULL,
  error_detail    jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE battlecards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  competitor_id   uuid NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  content         jsonb NOT NULL,
  generated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key_hash        text NOT NULL,
  key_prefix      text NOT NULL,
  label           text,
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz
);
```

### 16.2 Row Level Security (RLS)

Enable RLS on all tables. Apply policies:

- `profiles`: users can read and update only their own row.
- `competitors`: users can CRUD only their own competitors (`user_id = auth.uid()`).
- `reports`: users can read only their own reports.
- `battlecards`: users can read and delete only their own battlecards.
- `api_keys`: users can CRUD only their own keys.
- `report_errors`: no user-facing access (service role only).

---

## 17. API Endpoint Reference (Web App Backend)

These are the Next.js API Routes (or Route Handlers in App Router) that power the frontend.

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/signup` | None | Calls Supabase signUp |
| POST | `/api/auth/login` | None | Calls Supabase signIn |
| POST | `/api/auth/logout` | Required | Calls Supabase signOut |
| POST | `/api/auth/reset-password` | None | Triggers Supabase password reset email |
| GET | `/api/competitors` | Required | List user's competitors |
| POST | `/api/competitors` | Required | Create competitor |
| PUT | `/api/competitors/[id]` | Required | Update competitor |
| DELETE | `/api/competitors/[id]` | Required | Soft-delete (set `is_active = false`) |
| GET | `/api/reports` | Required | List reports (paginated) |
| GET | `/api/reports/[id]` | Required | Get single report |
| POST | `/api/billing/create-checkout` | Required | Create Stripe checkout session |
| POST | `/api/billing/portal` | Required | Create Stripe Customer Portal session |
| POST | `/api/webhooks/stripe` | Stripe signature | Handle Stripe webhook events |
| POST | `/api/webhooks/mpesa` | IP allowlist + shared secret | Receive Daraja STK Push callback |
| POST | `/api/webhooks/kcb` | IP allowlist + KCB secret | Receive Lipa na KCB payment callback |
| POST | `/api/webhooks/supabase` | Supabase secret | Receive `user.created` event, forward to n8n |
| POST | `/api/billing/mpesa-initiate` | Required | Initiate Mpesa STK Push for a plan |
| POST | `/api/billing/kcb-initiate` | Required | Initiate Lipa na KCB payment for a plan |
| POST | `/api/integrations/slack/test` | Required | Send test message to Slack webhook |
| PUT | `/api/integrations/slack` | Required | Save Slack webhook URL |
| GET | `/api/whitelabel/dns-records` | Required | Get DNS records from Resend |

All protected routes must validate the Supabase session cookie. Return `401` if no valid session.

---

## 18. Email Sequences

All emails are sent via Resend. Use Resend's template system for reusable layouts.

| Email | Trigger | Subject | Notes |
|-------|---------|---------|-------|
| Confirm email | Supabase Auth | "Confirm your Inteloop account" | Supabase built-in |
| Welcome report delivered | After report generated | "Your competitor baseline is ready — [Competitors]" | Include full report |
| No competitors reminder | 10 min after signup, no competitors | "One last step — tell us who to watch" | Deep link to onboarding form |
| Day 5 teaser | 5 days after signup | "Your first full report runs tomorrow at 6 AM" | List tracked competitors |
| Day 7 conversion | 7 days after signup | "How was your first report? Subscribe to keep these coming." | Direct Stripe checkout link |
| Payment failed | Stripe `invoice.payment_failed` | "Action required — your Inteloop payment failed" | Link to update payment method |
| Subscription cancelled | Stripe `customer.subscription.deleted` | "You've cancelled Inteloop — here's what you'll miss" | Include cancellation survey link |
| Cancellation survey | 1 hour after cancellation | "Quick question — why did you cancel?" | 1-question Typeform or inline form |

---

## 19. Claude API Prompt Specifications

### 19.1 Welcome Report Prompt

**System:**

```
You are a competitive intelligence analyst. Your job is to write a first-impression 
competitor report for a B2B company that has just signed up for Inteloop. 
The goal is to make an excellent first impression — show that the platform is 
insightful and immediately useful. Write in a direct, professional tone. 
Do not use filler phrases or padding. Every sentence must contain a useful insight 
or observation.

Return a JSON object with the following structure:
{
  "competitors": [
    {
      "name": "string",
      "snapshot": "string (1 paragraph)",
      "news": [{"headline": "string", "summary": "string", "date": "string", "url": "string"}],
      "website_signals": "string (2-4 observations)",
      "what_to_watch": ["string", "string", "string"],
      "scrape_limited": boolean
    }
  ],
  "closing_line": "This is your baseline. Every Monday we'll show you what changed."
}
```

**User message structure:**

```
I need a welcome report for a new Inteloop customer. 
Their tracked competitors are:

[For each competitor:]
COMPETITOR: {name}
WEBSITE: {url}
SCRAPED CONTENT: {firecrawl_markdown or "Limited data — see scrape_limited flag"}
NEWS (last 30 days): {brave_search_results}
```

### 19.2 Weekly Report Prompt

**System:**

```
You are a competitive intelligence analyst. Your job is to generate a weekly 
competitor intelligence briefing. Focus on CHANGE and DELTA — what is different 
from last week, not a static snapshot. Flag major changes explicitly using the 
major_change field. Write in a direct, professional tone.

Return a JSON object:
{
  "report_date": "string (YYYY-MM-DD)",
  "executive_summary": ["string (up to 5 bullets)"],
  "major_change": boolean,
  "major_change_summary": "string or null",
  "competitors": [
    {
      "name": "string",
      "weekly_delta": "string (what changed vs last week)",
      "news": [{"headline": "string", "summary": "string", "date": "string", "url": "string"}],
      "messaging_changes": "string or null",
      "strategic_implications": "string",
      "signals_to_watch": ["string"]
    }
  ]
}
```

### 19.3 Battlecard Prompt

**System:**

```
You are a competitive intelligence analyst specialising in sales enablement. 
Generate a concise battlecard a sales rep can use in a competitive deal. 
Be specific and actionable. Do not use vague language.

Return a JSON object:
{
  "competitor_name": "string",
  "positioning": "string",
  "strengths": ["string (max 3)"],
  "weaknesses": ["string (max 3)"],
  "pricing": "string",
  "key_differentiators": ["string"],
  "how_to_win": ["string (max 5 talking points)"],
  "landmines": ["string (topics to avoid)"],
  "generated_at": "ISO timestamp"
}
```

---

## 20. Environment Variables

All secrets must be stored in environment variables. Never hardcode credentials.

### 20.1 Next.js (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe (card / international payments)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_MONTHLY_PRICE_ID=
STRIPE_STARTER_ANNUAL_PRICE_ID=
STRIPE_GROWTH_MONTHLY_PRICE_ID=
STRIPE_GROWTH_ANNUAL_PRICE_ID=
STRIPE_PRO_MONTHLY_PRICE_ID=
STRIPE_PRO_ANNUAL_PRICE_ID=

# Mpesa — Safaricom Daraja API
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_BUSINESS_SHORT_CODE=
MPESA_PASSKEY=
MPESA_CALLBACK_URL=          # e.g. https://app.inteloop.com/api/webhooks/mpesa
MPESA_ENV=                   # 'sandbox' | 'production'

# Lipa na KCB — KCB Open Banking
KCB_API_KEY=
KCB_MERCHANT_CODE=
KCB_CALLBACK_SECRET=
KCB_CALLBACK_URL=            # e.g. https://app.inteloop.com/api/webhooks/kcb
KCB_ENV=                     # 'sandbox' | 'production'

RESEND_API_KEY=
N8N_WEBHOOK_SECRET=
N8N_WELCOME_REPORT_WEBHOOK_URL=
NEXT_PUBLIC_APP_URL=
```

### 20.2 n8n (DigitalOcean)

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
FIRECRAWL_API_KEY=
BRAVE_SEARCH_API_KEY=
RESEND_API_KEY=
N8N_WEBHOOK_SECRET=

# Mpesa renewal cron (n8n triggers STK Push for recurring billing)
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_BUSINESS_SHORT_CODE=
MPESA_PASSKEY=
MPESA_ENV=

# KCB renewal cron
KCB_API_KEY=
KCB_MERCHANT_CODE=
KCB_ENV=
```

---

## 21. Error Handling and Edge Cases

### 21.1 Firecrawl Failures

| Scenario | Handling |
|----------|----------|
| Response < 200 words | Flag `scrape_limited = true`, use Brave Search fallback, note in report |
| HTTP 4xx (bot protection) | Flag, use Brave Search fallback, note in report |
| HTTP 5xx (Firecrawl outage) | Retry once after 5 minutes, then fall back to Brave Search |
| Timeout > 30 seconds | Abort request, fall back to Brave Search |

### 21.2 Claude API Failures

| Scenario | Handling |
|----------|----------|
| Rate limit (429) | Retry with exponential backoff: 1 min, 5 min, 15 min |
| Invalid JSON returned | Retry with explicit "return valid JSON only" instruction |
| Response timeout | Retry once, then log to `report_errors`, skip this subscriber |
| Context length exceeded | Truncate competitor scraped content to 2,000 words per competitor before retrying |

### 21.3 Email Delivery Failures

| Scenario | Handling |
|----------|----------|
| Resend 4xx | Log error, do not retry (likely bad address) |
| Resend 5xx | Retry after 10 minutes, up to 3 attempts |
| Bounce | Mark `profiles.email_bounced = true`, alert operator |

### 21.4 Mobile Money Failures

| Scenario | Handling |
|----------|----------|
| STK Push not confirmed within 60 seconds | Show spinner; after 60s show: "Check your phone for the Mpesa prompt. Tap to retry." |
| Mpesa `ResultCode = 1032` (user cancelled) | Show: "Payment cancelled. Tap to try again." Do not retry automatically. |
| Mpesa `ResultCode = 1037` (timeout — user did not respond) | Show: "Your Mpesa session timed out. Tap to resend the prompt." |
| Mpesa `ResultCode = 1` (insufficient funds) | Show: "Insufficient Mpesa balance. Please top up and try again." |
| Daraja API unreachable | Log error, show: "Payment service temporarily unavailable. Try again in a few minutes." Do not mark subscription active. |
| KCB callback not received within 10 minutes | Mark payment as `pending_confirmation`, send user email to contact support. Log in `report_errors`. |
| Duplicate Mpesa `MpesaReceiptNumber` | Ignore duplicate callback — do not double-credit the subscription. Log as duplicate. |
| Mpesa renewal STK Push ignored (no response in 24 hours) | Send reminder email and try again at 48 hours. At 72 hours, suspend access. |

### 21.5 Stripe Webhook Failures

All Stripe webhooks must be idempotent. Use `event.id` as an idempotency key — store processed event IDs in a `stripe_events` table and skip reprocessing.

### 21.6 n8n Monday Outage

If the Monday 6 AM cron fails to run (server down), implement a recovery check: a second cron at 9 AM checks for subscribers who have not received a report in the past 8 days and retriggers their report. Alert the operator via a dedicated Slack channel.

---

## 22. Non-Functional Requirements

### 22.1 Performance

- Dashboard pages must load within 2 seconds on a standard broadband connection.
- API responses (web app routes) must complete within 500ms (excluding external API calls).
- Weekly report batch processing must complete before 07:30 UTC for all subscribers.

### 22.2 Security

- All Stripe webhook payloads must be validated using `stripe.webhooks.constructEvent()` with the webhook signing secret.
- All Supabase webhook payloads must be validated against a shared secret in the `x-webhook-secret` header.
- RLS must be enabled on all database tables — never disable for convenience.
- API keys must be stored as SHA-256 hashes. Never log or store plaintext keys.
- Firecrawl and Brave Search API keys must never be exposed to the frontend.
- Report content stored in Supabase must not include raw API keys, webhook URLs, or any user credential.

### 22.3 Scalability

- The weekly report n8n workflow must support processing 200+ subscribers without timeout.
- Implement batch processing in groups of 20 subscribers with a 2-second pause between batches to avoid API rate limits.
- Supabase free tier supports up to 500MB. Migrate to paid tier ($25/month) before exceeding 400MB.

### 22.4 Monitoring

- Set up UptimeRobot (free) to ping the n8n health endpoint every 5 minutes.
- Configure a dead man's switch: if no reports are logged in `reports` table by 07:30 UTC on Monday, send an operator alert to a dedicated Slack channel.
- Log all Claude API calls with token counts to `report_errors` (or a separate `api_usage` table) for cost monitoring.

---

## 23. Build Sequence and Milestones

Build in this order. Do not start Phase 2 features before Phase 1 is live with paying customers.

### Phase 1 — MVP (Weeks 1–8)

| Week | Deliverable |
|------|-------------|
| 1–2 | Supabase schema, Auth setup, basic Next.js app shell with login/signup |
| 3 | Competitor submission form, dashboard skeleton, competitor CRUD |
| 4 | n8n welcome report workflow (Brave Search + Firecrawl + Claude + Resend) |
| 5 | n8n weekly report workflow (cron, batch processing, Slack alert) |
| 6 | Stripe Billing integration (checkout, Customer Portal, webhook handlers) |
| 7 | Email sequences (D5 teaser, D7 conversion, payment failed, cancellation) |
| 8 | Report dashboard (list, detail view), QA, error handling, UptimeRobot setup |

**Phase 1 launch gate:** 10 agency customers manually validated before building the self-serve SaaS layer.

### Phase 2 — Growth Features (Weeks 9–16)

| Week | Deliverable |
|------|-------------|
| 9–10 | White-label report generation (logo swap, custom sender domain, DNS verification) |
| 11–12 | Growth plan tier enforcement (competitor limits, white-label gating) |
| 13–14 | Pro plan: daily briefing cron, battlecard generation |
| 15–16 | Pro plan: API access (key management, REST endpoints, rate limiting) |

### Phase 3 — Optimisation (Weeks 17–20)

| Week | Deliverable |
|------|-------------|
| 17 | Annual pricing + 2-months-free incentive |
| 18 | Cancellation survey + exit intent capture |
| 19 | Week-1 vs week-4 retention dashboard (operator view) |
| 20 | Referral programme (Growth+ gets shareable referral link, revenue share optional) |

---

## 24. Testing Requirements

### 24.1 Unit Tests

Required for:

- Competitor URL validation logic
- Plan limit enforcement (competitor count gating)
- Stripe webhook event handler (each event type)
- API key hash and prefix generation
- Report JSON structure validation (ensure Claude output conforms to schema before storage)

### 24.2 Integration Tests

Required for:

- Full welcome report flow: signup → competitor submit → n8n trigger → mock Claude/Firecrawl/Brave → email delivery → Supabase state update
- Full weekly report flow: cron → subscriber fetch → mock data sources → report generation → email delivery
- Stripe checkout flow: checkout created → payment succeeded → `profiles.plan` updated

### 24.3 Manual QA Checklist (Pre-Launch)

- Sign up with a real email and confirm the welcome report arrives within 60 minutes
- Verify report content is accurate and not empty for at least 3 test competitors
- Complete Stripe checkout and confirm dashboard unlocks
- Cancel via Stripe Customer Portal and confirm access is revoked after period end
- Trigger a major change flag and confirm Slack alert fires
- Test on mobile (iPhone Safari, Android Chrome) — all pages must be usable

---

## 25. Appendix: Key Dependencies and Versions

| Dependency | Version / Tier | Notes |
|------------|---------------|-------|
| Next.js | 14 (App Router) | Use server components where possible |
| Supabase JS | v2 | Use `@supabase/ssr` for server-side auth |
| Stripe Node SDK | Latest stable | Use `stripe.webhooks.constructEvent` for all webhooks |
| Resend SDK | Latest stable | |
| n8n | Latest stable (self-hosted) | Pin version in DigitalOcean droplet |
| Anthropic SDK | Latest stable | Use streaming for long report generations |
| Firecrawl SDK | Latest stable | |
| Tailwind CSS | v3 | For frontend styling |
| Zod | Latest | For API request/response validation |

---

*End of document. All queries about requirements should be directed to the product owner before implementation begins.*
