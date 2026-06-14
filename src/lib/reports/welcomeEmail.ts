import type { WelcomeReport } from "./schemas";

// PRD §8.3 step 6: "if any competitor section is < 100 words: add disclaimer
// 'Limited data available for [Competitor]'." We compute the threshold over
// the competitor's combined narrative content (snapshot + website_signals +
// what_to_watch + news titles/summaries).
export const QUALITY_DISCLAIMER_THRESHOLD = 100;

export type WelcomeCompetitor = WelcomeReport["competitors"][number];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function competitorWordCount(competitor: WelcomeCompetitor): number {
  const parts = [
    competitor.snapshot,
    competitor.website_signals,
    competitor.what_to_watch.join(" "),
    competitor.news.map((n) => `${n.headline} ${n.summary}`).join(" "),
  ];
  const text = parts.join(" ").trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function shouldDisclaim(competitor: WelcomeCompetitor): boolean {
  return competitorWordCount(competitor) < QUALITY_DISCLAIMER_THRESHOLD;
}

// PRD §8.3 step 7 subject template.
export function welcomeReportSubject(report: WelcomeReport): string {
  const names = report.competitors.map((c) => c.name);
  return `Your competitor baseline is ready — ${names.join(", ")}`;
}

function renderNewsList(competitor: WelcomeCompetitor): string {
  if (competitor.news.length === 0) {
    return '<p style="color:#666;font-style:italic;">No news in the last 30 days.</p>';
  }
  const items = competitor.news
    .map((n) => {
      const datePart = n.date ? ` <span style="color:#888;">(${escapeHtml(n.date)})</span>` : "";
      return `<li style="margin-bottom:8px;">
        <a href="${escapeHtml(n.url)}" style="color:#1d4ed8;">${escapeHtml(n.headline)}</a>${datePart}
        <div style="color:#555;">${escapeHtml(n.summary)}</div>
      </li>`;
    })
    .join("");
  return `<ul style="padding-left:18px;margin:8px 0;">${items}</ul>`;
}

function renderWhatToWatch(competitor: WelcomeCompetitor): string {
  if (competitor.what_to_watch.length === 0) return "";
  const items = competitor.what_to_watch
    .map((item) => `<li style="margin-bottom:4px;">${escapeHtml(item)}</li>`)
    .join("");
  return `<ul style="padding-left:18px;margin:8px 0;">${items}</ul>`;
}

function renderCompetitorBlock(competitor: WelcomeCompetitor): string {
  const limited = shouldDisclaim(competitor) || competitor.scrape_limited;
  const disclaimer = limited
    ? `<p style="color:#92400e;background:#fef3c7;padding:8px 12px;border-radius:4px;margin:8px 0;">
        Limited data available for ${escapeHtml(competitor.name)}.
      </p>`
    : "";

  return `<section style="margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #e5e7eb;">
    <h2 style="margin:0 0 8px;font-size:18px;">${escapeHtml(competitor.name)}</h2>
    ${disclaimer}

    <h3 style="margin:16px 0 4px;font-size:14px;color:#374151;">Snapshot</h3>
    <p style="margin:4px 0;">${escapeHtml(competitor.snapshot)}</p>

    <h3 style="margin:16px 0 4px;font-size:14px;color:#374151;">Website signals</h3>
    <p style="margin:4px 0;">${escapeHtml(competitor.website_signals)}</p>

    <h3 style="margin:16px 0 4px;font-size:14px;color:#374151;">Last 30 days in the news</h3>
    ${renderNewsList(competitor)}

    <h3 style="margin:16px 0 4px;font-size:14px;color:#374151;">What to watch</h3>
    ${renderWhatToWatch(competitor)}
  </section>`;
}

const WHATS_COMING_COPY =
  "Every Monday at 6 AM, you'll get a deeper briefing — week-on-week changes for each competitor, strategic implications, and an executive summary across all of them.";

export function renderWelcomeReportHtml(report: WelcomeReport): string {
  const competitorBlocks = report.competitors.map(renderCompetitorBlock).join("\n");

  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;line-height:1.5;max-width:640px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;margin:0 0 24px;">Your competitor baseline</h1>
  ${competitorBlocks}
  <section style="margin-bottom:24px;">
    <h2 style="font-size:16px;margin:0 0 8px;">What's coming Monday</h2>
    <p style="margin:0;">${escapeHtml(WHATS_COMING_COPY)}</p>
  </section>
  <p style="font-style:italic;color:#374151;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px;">
    ${escapeHtml(report.closing_line)}
  </p>
</body></html>`;
}

// =========================================================
// Reminder email — PRD §18, fires 10 minutes after signup with no
// competitors submitted.
// =========================================================
export function reminderEmailSubject(): string {
  return "One last step — tell us who to watch";
}

export function renderReminderEmailHtml(options: { appUrl: string }): string {
  const url = options.appUrl.replace(/\/$/, "") + "/dashboard/competitors";
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;line-height:1.5;max-width:640px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;margin:0 0 16px;">Tell us who you'd like to watch</h1>
  <p>Your Inteloop account is ready. Add a few competitors and we'll deliver your first
  intelligence briefing within the hour.</p>
  <p style="margin-top:24px;">
    <a href="${escapeHtml(url)}" style="background:#000;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;display:inline-block;">
      Add competitors
    </a>
  </p>
</body></html>`;
}
