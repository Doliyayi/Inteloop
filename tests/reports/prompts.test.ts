import { describe, expect, it } from "vitest";

import {
  BATTLECARD_SYSTEM_PROMPT,
  buildBattlecardUserMessage,
  buildWeeklyUserMessage,
  buildWelcomeUserMessage,
  truncateScrapedContent,
  WEEKLY_SYSTEM_PROMPT,
  WELCOME_SYSTEM_PROMPT,
  type CompetitorInput,
} from "@/lib/reports/prompts";

const sampleCompetitor: CompetitorInput = {
  name: "Stripe",
  website_url: "https://stripe.com",
  scraped_content: "Stripe builds payments infrastructure.",
  news: [
    {
      title: "Stripe launches X",
      snippet: "Quick summary",
      url: "https://news.example/x",
      date: "2026-06-13",
    },
  ],
};

describe("system prompts (verbatim from PRD §19)", () => {
  it("welcome prompt mentions Inteloop and includes the closing_line literal", () => {
    expect(WELCOME_SYSTEM_PROMPT).toMatch(/Inteloop/);
    expect(WELCOME_SYSTEM_PROMPT).toContain(
      "This is your baseline. Every Monday we'll show you what changed.",
    );
    expect(WELCOME_SYSTEM_PROMPT).toContain("scrape_limited");
  });

  it("weekly prompt instructs the model to focus on CHANGE and DELTA", () => {
    expect(WEEKLY_SYSTEM_PROMPT).toContain("CHANGE and DELTA");
    expect(WEEKLY_SYSTEM_PROMPT).toContain("major_change");
  });

  it("battlecard prompt frames the task as sales enablement", () => {
    expect(BATTLECARD_SYSTEM_PROMPT).toContain("sales enablement");
    expect(BATTLECARD_SYSTEM_PROMPT).toContain("how_to_win");
    expect(BATTLECARD_SYSTEM_PROMPT).toContain("landmines");
  });
});

describe("user message builders", () => {
  it("welcome message includes COMPETITOR / WEBSITE / SCRAPED CONTENT / NEWS sections", () => {
    const message = buildWelcomeUserMessage({ competitors: [sampleCompetitor] });
    expect(message).toContain("COMPETITOR: Stripe");
    expect(message).toContain("WEBSITE: https://stripe.com");
    expect(message).toContain("SCRAPED CONTENT: Stripe builds payments infrastructure.");
    expect(message).toContain("NEWS:");
    expect(message).toContain("Stripe launches X");
    expect(message).toContain("https://news.example/x");
  });

  it("welcome message substitutes the placeholder when scraped_content is missing", () => {
    const message = buildWelcomeUserMessage({
      competitors: [{ ...sampleCompetitor, scraped_content: undefined }],
    });
    expect(message).toContain("SCRAPED CONTENT: Limited data — see scrape_limited flag");
  });

  it("weekly message includes the previous-week summary when provided", () => {
    const message = buildWeeklyUserMessage({
      competitors: [sampleCompetitor],
      previous_report_summary: "Last week Stripe announced Y.",
    });
    expect(message).toContain("PREVIOUS WEEK SUMMARY");
    expect(message).toContain("Last week Stripe announced Y.");
  });

  it("weekly message notes when there is no previous summary", () => {
    const message = buildWeeklyUserMessage({ competitors: [sampleCompetitor] });
    expect(message).toContain("PREVIOUS WEEK SUMMARY: (none — this is the first weekly report)");
  });

  it("battlecard message formats a single competitor", () => {
    const message = buildBattlecardUserMessage({ competitor: sampleCompetitor });
    expect(message).toContain("Generate a battlecard");
    expect(message).toContain("COMPETITOR: Stripe");
  });
});

describe("truncateScrapedContent (PRD §21.2 context-length recovery)", () => {
  function withWords(n: number): CompetitorInput {
    return {
      ...sampleCompetitor,
      scraped_content: Array.from({ length: n }, (_, i) => `word${i}`).join(" "),
    };
  }

  it("leaves content under the budget untouched", () => {
    const competitor = withWords(50);
    const [out] = truncateScrapedContent([competitor], 2000);
    expect(out?.scraped_content).toBe(competitor.scraped_content);
  });

  it("trims content over the budget to exactly the budget", () => {
    const competitor = withWords(3000);
    const [out] = truncateScrapedContent([competitor], 2000);
    const wordCount = out?.scraped_content?.split(/\s+/).filter(Boolean).length ?? 0;
    expect(wordCount).toBe(2000);
  });

  it("does not crash on missing scraped_content", () => {
    const competitor = { ...sampleCompetitor, scraped_content: undefined };
    const [out] = truncateScrapedContent([competitor], 2000);
    expect(out?.scraped_content).toBeUndefined();
  });

  it("trims every competitor independently", () => {
    const a = withWords(3000);
    const b = withWords(1000);
    const [outA, outB] = truncateScrapedContent([a, b], 2000);
    expect(outA?.scraped_content?.split(/\s+/).filter(Boolean).length).toBe(2000);
    expect(outB?.scraped_content?.split(/\s+/).filter(Boolean).length).toBe(1000);
  });
});
