import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportView } from "@/components/reports/ReportView";
import { WELCOME_CLOSING_LINE } from "@/lib/reports/schemas";

function render(reportType: string, content: unknown): string {
  return renderToStaticMarkup(createElement(ReportView, { reportType, content }));
}

describe("ReportView (PRD §11.3 — render stored JSON in the dashboard)", () => {
  it("renders a welcome report's competitor sections and closing line", () => {
    const html = render("welcome", {
      competitors: [
        {
          name: "Acme",
          snapshot: "Acme is a CRM vendor.",
          news: [
            {
              headline: "Acme raises Series B",
              summary: "Funding round.",
              date: "2026-06-10",
              url: "https://news.example/acme",
            },
          ],
          website_signals: "Pricing page emphasises enterprise.",
          what_to_watch: ["New pricing tiers"],
          scrape_limited: false,
        },
      ],
      closing_line: WELCOME_CLOSING_LINE,
    });

    expect(html).toContain("Acme");
    expect(html).toContain("Acme is a CRM vendor.");
    expect(html).toContain("Acme raises Series B");
    expect(html).toContain("https://news.example/acme");
    expect(html).toContain("New pricing tiers");
    // The closing line is present; its apostrophe is HTML-entity encoded in
    // static markup, so assert on the apostrophe-free portions.
    expect(html).toContain("This is your baseline.");
    expect(html).toContain("show you what changed.");
  });

  it("renders a weekly report with the major-change banner only when flagged", () => {
    const base = {
      report_date: "2026-06-15",
      executive_summary: ["Acme cut prices."],
      competitors: [
        {
          name: "Acme",
          weekly_delta: "Dropped entry price 20%.",
          news: [],
          messaging_changes: null,
          strategic_implications: "Pressure on mid-tier.",
          signals_to_watch: ["annual discounts"],
        },
      ],
    };

    const plain = render("weekly", { ...base, major_change: false, major_change_summary: null });
    expect(plain).toContain("Executive summary");
    expect(plain).toContain("Dropped entry price 20%.");
    expect(plain).toContain("Pressure on mid-tier.");
    expect(plain).not.toContain("Major change detected");

    const flagged = render("weekly", {
      ...base,
      major_change: true,
      major_change_summary: "Acme acquired Beta.",
    });
    expect(flagged).toContain("Major change detected");
    expect(flagged).toContain("Acme acquired Beta.");
  });

  it("falls back gracefully for an unknown or malformed report", () => {
    expect(render("battlecard", { anything: true })).toContain("can");
    expect(render("weekly", { bogus: "shape" })).toContain("can");
  });
});
