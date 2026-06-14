import { describe, expect, it } from "vitest";

import { WELCOME_CLOSING_LINE, type WelcomeReport } from "@/lib/reports/schemas";
import {
  competitorWordCount,
  reminderEmailSubject,
  renderReminderEmailHtml,
  renderWelcomeReportHtml,
  shouldDisclaim,
  welcomeReportSubject,
} from "@/lib/reports/welcomeEmail";

const richCompetitor: WelcomeReport["competitors"][number] = {
  name: "Stripe",
  snapshot: Array.from({ length: 60 }, (_, i) => `snap${i}`).join(" "),
  news: [
    {
      headline: "Stripe launches a payments API",
      summary: "A short summary of the launch.",
      date: "2026-06-13",
      url: "https://stripe.com/news/launch",
    },
  ],
  website_signals: Array.from({ length: 30 }, (_, i) => `signal${i}`).join(" "),
  what_to_watch: ["pricing changes", "expansion to Asia"],
  scrape_limited: false,
};

const thinCompetitor: WelcomeReport["competitors"][number] = {
  name: "Tinyco",
  snapshot: "Very brief.",
  news: [],
  website_signals: "Almost nothing.",
  what_to_watch: ["wait"],
  scrape_limited: false,
};

function sampleReport(): WelcomeReport {
  return {
    competitors: [richCompetitor, thinCompetitor],
    closing_line: WELCOME_CLOSING_LINE,
  };
}

describe("welcomeReportSubject", () => {
  it("lists the competitor names per PRD §8.3 step 7", () => {
    expect(welcomeReportSubject(sampleReport())).toBe(
      "Your competitor baseline is ready — Stripe, Tinyco",
    );
  });
});

describe("competitorWordCount + shouldDisclaim", () => {
  it("counts words across all narrative fields", () => {
    expect(competitorWordCount(richCompetitor)).toBeGreaterThan(100);
    expect(competitorWordCount(thinCompetitor)).toBeLessThan(100);
  });

  it("disclaims any competitor below the 100-word threshold", () => {
    expect(shouldDisclaim(richCompetitor)).toBe(false);
    expect(shouldDisclaim(thinCompetitor)).toBe(true);
  });
});

describe("renderWelcomeReportHtml", () => {
  it("includes every competitor and the closing line (HTML-escaped)", () => {
    const html = renderWelcomeReportHtml(sampleReport());
    expect(html).toContain("Stripe");
    expect(html).toContain("Tinyco");
    // Apostrophes are escaped for HTML safety, so the literal "we'll" becomes "we&#39;ll".
    expect(html).toContain("This is your baseline. Every Monday we&#39;ll show you what changed.");
    expect(html).toContain("What's coming Monday");
  });

  it("renders the §8.3 step-6 disclaimer for thin competitors", () => {
    const html = renderWelcomeReportHtml(sampleReport());
    expect(html).toContain("Limited data available for Tinyco");
    expect(html).not.toContain("Limited data available for Stripe");
  });

  it("links news items to their URL", () => {
    const html = renderWelcomeReportHtml(sampleReport());
    expect(html).toContain('href="https://stripe.com/news/launch"');
    expect(html).toContain("No news in the last 30 days");
  });

  it("escapes user-controlled text (XSS-safe)", () => {
    const malicious: WelcomeReport = {
      competitors: [
        {
          name: "<script>alert(1)</script>",
          snapshot: "ok",
          news: [],
          website_signals: "ok",
          what_to_watch: [],
          scrape_limited: false,
        },
      ],
      closing_line: WELCOME_CLOSING_LINE,
    };
    const html = renderWelcomeReportHtml(malicious);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("reminder email", () => {
  it("uses the PRD §18 subject", () => {
    expect(reminderEmailSubject()).toBe("One last step — tell us who to watch");
  });

  it("links to /dashboard/competitors at the app URL", () => {
    const html = renderReminderEmailHtml({ appUrl: "https://app.inteloop.com" });
    expect(html).toContain('href="https://app.inteloop.com/dashboard/competitors"');
  });

  it("strips a trailing slash from appUrl", () => {
    const html = renderReminderEmailHtml({ appUrl: "https://app.inteloop.com/" });
    expect(html).toContain('href="https://app.inteloop.com/dashboard/competitors"');
  });
});
