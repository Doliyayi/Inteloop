import type { WeeklyReport } from "./schemas";

// Weekly report email render — PRD §9.2 sections. Mirrors welcomeEmail.ts so
// the two reports look consistent. §11.3 note: the same structured JSON drives
// both the email and (later) the dashboard view; this module renders the email.

type WeeklyCompetitor = WeeklyReport["competitors"][number];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// PRD §9.3 step g subject template.
export function weeklyReportSubject(report: WeeklyReport): string {
  return `Your weekly competitor report — ${report.report_date}`;
}

function renderExecutiveSummary(report: WeeklyReport): string {
  if (report.executive_summary.length === 0) return "";
  const items = report.executive_summary
    .map((bullet) => `<li style="margin-bottom:6px;">${escapeHtml(bullet)}</li>`)
    .join("");
  return `<section style="margin-bottom:28px;">
    <h2 style="font-size:16px;margin:0 0 8px;">Executive summary</h2>
    <ul style="padding-left:18px;margin:8px 0;">${items}</ul>
  </section>`;
}

function renderMajorChangeBanner(report: WeeklyReport): string {
  if (!report.major_change || !report.major_change_summary) return "";
  return `<section style="margin-bottom:24px;background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:4px;">
    <strong style="color:#991b1b;">Major change detected</strong>
    <p style="margin:6px 0 0;">${escapeHtml(report.major_change_summary)}</p>
  </section>`;
}

function renderNewsList(competitor: WeeklyCompetitor): string {
  if (competitor.news.length === 0) {
    return '<p style="color:#666;font-style:italic;">No notable news this week.</p>';
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

function renderSignals(competitor: WeeklyCompetitor): string {
  if (competitor.signals_to_watch.length === 0) return "";
  const items = competitor.signals_to_watch
    .map((s) => `<li style="margin-bottom:4px;">${escapeHtml(s)}</li>`)
    .join("");
  return `<ul style="padding-left:18px;margin:8px 0;">${items}</ul>`;
}

function renderCompetitorBlock(competitor: WeeklyCompetitor): string {
  const messaging = competitor.messaging_changes
    ? `<h3 style="margin:16px 0 4px;font-size:14px;color:#374151;">Messaging changes</h3>
       <p style="margin:4px 0;">${escapeHtml(competitor.messaging_changes)}</p>`
    : "";

  return `<section style="margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #e5e7eb;">
    <h2 style="margin:0 0 8px;font-size:18px;">${escapeHtml(competitor.name)}</h2>

    <h3 style="margin:16px 0 4px;font-size:14px;color:#374151;">What changed this week</h3>
    <p style="margin:4px 0;">${escapeHtml(competitor.weekly_delta)}</p>

    <h3 style="margin:16px 0 4px;font-size:14px;color:#374151;">In the news</h3>
    ${renderNewsList(competitor)}
    ${messaging}

    <h3 style="margin:16px 0 4px;font-size:14px;color:#374151;">Strategic implications</h3>
    <p style="margin:4px 0;">${escapeHtml(competitor.strategic_implications)}</p>

    <h3 style="margin:16px 0 4px;font-size:14px;color:#374151;">Signals to watch</h3>
    ${renderSignals(competitor)}
  </section>`;
}

export function renderWeeklyReportHtml(report: WeeklyReport): string {
  const competitorBlocks = report.competitors.map(renderCompetitorBlock).join("\n");

  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;line-height:1.5;max-width:640px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;margin:0 0 8px;">Your weekly competitor report</h1>
  <p style="color:#6b7280;margin:0 0 24px;">${escapeHtml(report.report_date)}</p>
  ${renderMajorChangeBanner(report)}
  ${renderExecutiveSummary(report)}
  ${competitorBlocks}
</body></html>`;
}
