import { describe, expect, it } from "vitest";

import { renderWeeklyReportHtml } from "@/lib/reports/weeklyEmail";
import { DEFAULT_BRANDING, type ReportBranding } from "@/lib/whitelabel/branding";
import type { WeeklyReport } from "@/lib/reports/schemas";

const report: WeeklyReport = {
  report_date: "2026-06-17",
  executive_summary: ["Acme cut prices."],
  major_change: false,
  major_change_summary: null,
  competitors: [
    {
      name: "Acme",
      weekly_delta: "Cut prices 20%.",
      news: [],
      messaging_changes: null,
      strategic_implications: "Pressure on mid-tier.",
      signals_to_watch: ["annual discounts"],
    },
  ],
};

const agency: ReportBranding = {
  productName: "Agency Insights",
  logoUrl: "https://agency.example/logo.png",
  footerText: "Sent by Agency Insights",
  whiteLabeled: true,
};

describe("report email branding (PRD §13)", () => {
  it("default render shows the Inteloop footer and no logo", () => {
    const html = renderWeeklyReportHtml(report);
    expect(html).toContain("Sent by Inteloop");
    expect(html).not.toContain("<img");
  });

  it("white-label render shows the agency logo + footer, not Inteloop", () => {
    const html = renderWeeklyReportHtml(report, agency);
    expect(html).toContain("https://agency.example/logo.png");
    expect(html).toContain("Sent by Agency Insights");
    expect(html).not.toContain("Sent by Inteloop");
  });

  it("default branding constant is not white-labeled", () => {
    expect(DEFAULT_BRANDING.whiteLabeled).toBe(false);
  });
});
