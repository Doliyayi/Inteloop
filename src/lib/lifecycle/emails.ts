// Trial-lifecycle email copy (PRD §18). Plain inline-styled HTML like the
// other transactional emails (welcomeEmail / billingEmail) — email clients
// don't run Tailwind.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 18px;background:#e11d48;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">${escapeHtml(label)}</a>`;
}

function shell(body: string): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
${body}
</body></html>`;
}

// --- Day 5 teaser ------------------------------------------------------------

export function day5TeaserSubject(): string {
  return "Your first full report runs tomorrow at 6 AM";
}

export function renderDay5TeaserHtml(opts: {
  competitorNames: string[];
  dashboardUrl: string;
}): string {
  const list =
    opts.competitorNames.length > 0
      ? `<ul style="padding-left:18px;margin:8px 0;">${opts.competitorNames
          .map((n) => `<li>${escapeHtml(n)}</li>`)
          .join("")}</ul>`
      : "";
  return shell(`
  <h2 style="margin:0 0 12px;">Your first full report runs tomorrow at 6 AM</h2>
  <p>Tomorrow morning you'll get your first weekly competitor briefing — what changed,
     why it matters, and what to watch. We're tracking:</p>
  ${list}
  <p style="margin-top:20px;">${button(opts.dashboardUrl, "Review your competitors")}</p>
  <p style="color:#666;font-size:13px;">Want to add or remove anyone before tomorrow? Now's the time.</p>`);
}

// --- Day 7 conversion --------------------------------------------------------

export function day7ConversionSubject(): string {
  return "How was your first report? Subscribe to keep these coming.";
}

export function renderDay7ConversionHtml(opts: { subscribeUrl: string }): string {
  return shell(`
  <h2 style="margin:0 0 12px;">How was your first report?</h2>
  <p>You've now seen what Inteloop delivers every week — a sharp read on what your
     competitors are doing, without the manual digging.</p>
  <p>To keep the briefings coming, pick a plan and you're set:</p>
  <p style="margin-top:20px;">${button(opts.subscribeUrl, "Subscribe to keep these coming")}</p>
  <p style="color:#666;font-size:13px;">Your trial reports pause if you don't subscribe — but your tracked competitors stay saved.</p>`);
}

// --- Cancellation survey (1 hour after cancellation) -------------------------

export function cancellationSurveySubject(): string {
  return "Quick question — why did you cancel?";
}

export function renderCancellationSurveyHtml(opts: { surveyUrl: string }): string {
  return shell(`
  <h2 style="margin:0 0 12px;">Quick question — why did you cancel?</h2>
  <p>We're sorry to see you go. If you have 20 seconds, one quick answer helps us
     make Inteloop better:</p>
  <p style="margin-top:20px;">${button(opts.surveyUrl, "Tell us why")}</p>
  <p style="color:#666;font-size:13px;">No hard feelings — your competitors stay saved if you ever come back.</p>`);
}
