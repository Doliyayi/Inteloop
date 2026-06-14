import { describe, expect, it } from "vitest";

import {
  battlecardSchema,
  WELCOME_CLOSING_LINE,
  weeklyReportSchema,
  welcomeReportSchema,
} from "@/lib/reports/schemas";

const conformantWelcome = {
  competitors: [
    {
      name: "Stripe",
      snapshot: "Payments infrastructure for the internet.",
      news: [
        {
          headline: "Stripe ships X",
          summary: "Short summary.",
          date: "2026-06-13",
          url: "https://stripe.com/news/x",
        },
      ],
      website_signals: "Two observations.",
      what_to_watch: ["one", "two", "three"],
      scrape_limited: false,
    },
  ],
  closing_line: WELCOME_CLOSING_LINE,
};

const conformantWeekly = {
  report_date: "2026-06-14",
  executive_summary: ["one", "two"],
  major_change: true,
  major_change_summary: "Stripe acquired X.",
  competitors: [
    {
      name: "Stripe",
      weekly_delta: "Acquired X.",
      news: [],
      messaging_changes: null,
      strategic_implications: "Watch their bundling.",
      signals_to_watch: ["one"],
    },
  ],
};

const conformantBattlecard = {
  competitor_name: "Stripe",
  positioning: "Developer-first payments.",
  strengths: ["dev experience", "global"],
  weaknesses: ["price"],
  pricing: "2.9% + 30c.",
  key_differentiators: ["API"],
  how_to_win: ["talk about pricing"],
  landmines: ["raising dev tooling"],
  generated_at: "2026-06-14T00:00:00Z",
};

describe("welcomeReportSchema", () => {
  it("accepts a conformant payload", () => {
    expect(welcomeReportSchema.safeParse(conformantWelcome).success).toBe(true);
  });

  it("rejects when closing_line is not the PRD §8.2 verbatim text", () => {
    const bad = { ...conformantWelcome, closing_line: "Something else." };
    expect(welcomeReportSchema.safeParse(bad).success).toBe(false);
  });

  it("requires scrape_limited on every competitor", () => {
    const bad = {
      ...conformantWelcome,
      competitors: [
        {
          name: "Stripe",
          snapshot: "x",
          news: [],
          website_signals: "x",
          what_to_watch: [],
          // scrape_limited missing
        },
      ],
    };
    expect(welcomeReportSchema.safeParse(bad).success).toBe(false);
  });
});

describe("weeklyReportSchema", () => {
  it("accepts a conformant payload", () => {
    expect(weeklyReportSchema.safeParse(conformantWeekly).success).toBe(true);
  });

  it("requires major_change as a boolean", () => {
    const bad = { ...conformantWeekly, major_change: "yes" };
    expect(weeklyReportSchema.safeParse(bad).success).toBe(false);
  });

  it("allows major_change_summary to be null", () => {
    const ok = { ...conformantWeekly, major_change: false, major_change_summary: null };
    expect(weeklyReportSchema.safeParse(ok).success).toBe(true);
  });

  it("caps executive_summary at 5 bullets", () => {
    const bad = {
      ...conformantWeekly,
      executive_summary: ["a", "b", "c", "d", "e", "f"],
    };
    expect(weeklyReportSchema.safeParse(bad).success).toBe(false);
  });

  it("requires messaging_changes to be string or null (not omitted)", () => {
    const bad = {
      ...conformantWeekly,
      competitors: [
        {
          name: "Stripe",
          weekly_delta: "x",
          news: [],
          // messaging_changes missing entirely
          strategic_implications: "x",
          signals_to_watch: [],
        },
      ],
    };
    expect(weeklyReportSchema.safeParse(bad).success).toBe(false);
  });
});

describe("battlecardSchema", () => {
  it("accepts a conformant payload", () => {
    expect(battlecardSchema.safeParse(conformantBattlecard).success).toBe(true);
  });

  it("rejects more than 3 strengths", () => {
    const bad = { ...conformantBattlecard, strengths: ["a", "b", "c", "d"] };
    expect(battlecardSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects more than 3 weaknesses", () => {
    const bad = { ...conformantBattlecard, weaknesses: ["a", "b", "c", "d"] };
    expect(battlecardSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects more than 5 how_to_win talking points", () => {
    const bad = {
      ...conformantBattlecard,
      how_to_win: ["a", "b", "c", "d", "e", "f"],
    };
    expect(battlecardSchema.safeParse(bad).success).toBe(false);
  });
});
