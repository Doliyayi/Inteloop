import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BattlecardView } from "@/components/battlecards/BattlecardView";

function render(content: unknown): string {
  return renderToStaticMarkup(createElement(BattlecardView, { content }));
}

const battlecard = {
  competitor_name: "Acme",
  positioning: "Mid-market analytics, ease-of-setup play.",
  strengths: ["Fast onboarding", "Strong brand"],
  weaknesses: ["Thin enterprise features"],
  pricing: "From $79/mo",
  key_differentiators: ["No-code dashboards"],
  how_to_win: ["Lead with enterprise security", "Show migration support"],
  landmines: ["Don't compete on setup speed"],
  generated_at: "2026-06-17T00:00:00Z",
};

describe("BattlecardView (PRD §14.2)", () => {
  it("renders all sections", () => {
    const html = render(battlecard);
    expect(html).toContain("Positioning");
    expect(html).toContain("Mid-market analytics, ease-of-setup play.");
    expect(html).toContain("From $79/mo");
    expect(html).toContain("Strengths");
    expect(html).toContain("Fast onboarding");
    expect(html).toContain("Weaknesses");
    expect(html).toContain("How to win");
    expect(html).toContain("Lead with enterprise security");
    expect(html).toContain("Landmines");
  });

  it("degrades gracefully on malformed content", () => {
    expect(render({ nonsense: true })).toContain("can");
  });
});
