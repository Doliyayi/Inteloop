// Billing transactional emails. Kept separate from report emails so the
// dunning/confirmation copy lives next to the billing logic that triggers it.
// Source: docs/inteloop-prd.md §10.11 (dunning), §10.6 step 5 (confirmation).

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function paymentFailedSubject(): string {
  return "Action needed: your Inteloop payment failed";
}

export function renderPaymentFailedHtml(opts: { portalUrl: string }): string {
  const url = escapeHtml(opts.portalUrl);
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a;">
    <h2>We couldn't process your payment</h2>
    <p>Your most recent Inteloop subscription payment didn't go through. Your reports
      will keep running for now, but we'll need a working payment method to continue.</p>
    <p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#0b5cff;color:#fff;text-decoration:none;border-radius:6px;">Update payment method</a></p>
    <p>If you don't update it, your subscription will be cancelled after a few reminders.</p>
  </body>
</html>`;
}

export function paymentConfirmedSubject(planName: string): string {
  return `Your Inteloop ${planName} subscription is active`;
}

export function renderPaymentConfirmedHtml(opts: {
  planName: string;
  amountLabel: string;
}): string {
  const plan = escapeHtml(opts.planName);
  const amount = escapeHtml(opts.amountLabel);
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a;">
    <h2>Payment received — thank you!</h2>
    <p>Your <strong>${plan}</strong> subscription is now active. We charged ${amount}.</p>
    <p>Your next weekly report is on its way. Every Monday we'll show you what changed.</p>
  </body>
</html>`;
}
