import { DEFAULT_BRANDING, type ReportBranding } from "../whitelabel/branding";
import { brandingFooterHtml, brandingHeaderHtml } from "./welcomeEmail";
import type { DailyBriefing } from "./schemas";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function dailyBriefingSubject(report: DailyBriefing): string {
  return `Daily competitor briefing — ${report.report_date}`;
}

function renderMajorChangeBanner(report: DailyBriefing): string {
  if (!report.major_change || !report.major_change_summary) return "";
  return `<section style="margin-bottom:24px;background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:4px;">
    <strong style="color:#991b1b;">Major change detected</strong>
    <p style="margin:6px 0 0;">${escapeHtml(report.major_change_summary)}</p>
  </section>`;
}

function renderItems(report: DailyBriefing): string {
  if (report.items.length === 0) {
    return '<p style="color:#666;font-style:italic;">No notable news in the last 24 hours.</p>';
  }
  const rows = report.items
    .map(
      (item) => `<li style="margin-bottom:16px;">
      <span style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">${escapeHtml(item.competitor)}</span>
      <div style="margin:4px 0;">
        <a href="${escapeHtml(item.url)}" style="color:#1d4ed8;font-weight:500;">${escapeHtml(item.headline)}</a>
      </div>
      <div style="color:#555;">${escapeHtml(item.summary)}</div>
    </li>`,
    )
    .join("");
  return `<ul style="padding-left:0;margin:8px 0;list-style:none;">${rows}</ul>`;
}

export function renderDailyBriefingHtml(
  report: DailyBriefing,
  branding: ReportBranding = DEFAULT_BRANDING,
): string {
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;line-height:1.5;max-width:640px;margin:0 auto;padding:24px;">
  ${brandingHeaderHtml(branding)}
  <h1 style="font-size:22px;margin:0 0 8px;">Daily competitor briefing</h1>
  <p style="color:#6b7280;margin:0 0 24px;">${escapeHtml(report.report_date)}</p>
  ${renderMajorChangeBanner(report)}
  <section style="margin-bottom:24px;">
    <h2 style="font-size:16px;margin:0 0 8px;">Summary</h2>
    <p style="margin:0;">${escapeHtml(report.summary)}</p>
  </section>
  <section style="margin-bottom:24px;">
    <h2 style="font-size:16px;margin:0 0 12px;">Today's news</h2>
    ${renderItems(report)}
  </section>
  ${brandingFooterHtml(branding)}
</body></html>`;
}
