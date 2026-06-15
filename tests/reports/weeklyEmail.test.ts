import { describe, expect, it } from "vitest";

import { renderWeeklyReportHtml, weeklyReportSubject } from "@/lib/reports/weeklyEmail";
import type { WeeklyReport } from "@/lib/reports/schemas";

function report(overrides: Partial<WeeklyReport> = {}): WeeklyReport {
  return {
    report_date: "2026-06-15",
    executive_summary: ["Acme cut prices.", "Globex hired a new CRO."],
    major_change: false,
    major_change_summary: null,
    competitors: [
      {
        name: "Acme",
        weekly_delta: "Dropped entry price by 20%.",
        news: [
          {
            headline: "Acme slashes prices",
            summary: "New tier announced.",
            date: "2026-06-12",
            url: "https://news.example/acme",
          },
        ],
        messaging_changes: "Now leads with 'affordable'.",
        strategic_implications: "Pressure on your mid-tier.",
        signals_to_watch: ["Will they discount annual plans?"],
      },
    ],
    ...overrides,
  };
}

describe("weeklyReportSubject (PRD §9.3 step g)", () => {
  it("uses the report date", () => {
    expect(weeklyReportSubject(report())).toBe("Your weekly competitor report — 2026-06-15");
  });
});

describe("renderWeeklyReportHtml (PRD §9.2)", () => {
  it("renders exec summary, competitor delta, news, implications, and signals", () => {
    const html = renderWeeklyReportHtml(report());
    expect(html).toContain("Executive summary");
    expect(html).toContain("Acme cut prices.");
    expect(html).toContain("What changed this week");
    expect(html).toContain("Dropped entry price by 20%.");
    expect(html).toContain("Acme slashes prices");
    expect(html).toContain("Strategic implications");
    expect(html).toContain("Will they discount annual plans?");
  });

  it("shows the major-change banner only when flagged", () => {
    expect(renderWeeklyReportHtml(report())).not.toContain("Major change detected");
    const flagged = renderWeeklyReportHtml(
      report({ major_change: true, major_change_summary: "Globex acquired a rival." }),
    );
    expect(flagged).toContain("Major change detected");
    expect(flagged).toContain("Globex acquired a rival.");
  });

  it("escapes HTML in untrusted fields", () => {
    const html = renderWeeklyReportHtml(
      report({
        competitors: [
          {
            name: "<script>",
            weekly_delta: "a & b",
            news: [],
            messaging_changes: null,
            strategic_implications: "x",
            signals_to_watch: [],
          },
        ],
      }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).not.toContain("<script>");
  });
});
