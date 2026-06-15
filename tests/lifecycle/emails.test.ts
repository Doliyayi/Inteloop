import { describe, expect, it } from "vitest";

import {
  renderSubscriptionCancelledHtml,
  subscriptionCancelledSubject,
} from "@/lib/billing/billingEmail";
import {
  cancellationSurveySubject,
  day5TeaserSubject,
  day7ConversionSubject,
  renderCancellationSurveyHtml,
  renderDay5TeaserHtml,
  renderDay7ConversionHtml,
} from "@/lib/lifecycle/emails";

describe("lifecycle email copy (PRD §18)", () => {
  it("uses the spec subjects", () => {
    expect(day5TeaserSubject()).toBe("Your first full report runs tomorrow at 6 AM");
    expect(day7ConversionSubject()).toBe(
      "How was your first report? Subscribe to keep these coming.",
    );
    expect(cancellationSurveySubject()).toBe("Quick question — why did you cancel?");
    expect(subscriptionCancelledSubject()).toBe(
      "You've cancelled Inteloop — here's what you'll miss",
    );
  });

  it("day-5 teaser lists tracked competitors and links to the dashboard", () => {
    const html = renderDay5TeaserHtml({
      competitorNames: ["Acme", "Globex"],
      dashboardUrl: "https://app.inteloop.test/dashboard/competitors",
    });
    expect(html).toContain("Acme");
    expect(html).toContain("Globex");
    expect(html).toContain("https://app.inteloop.test/dashboard/competitors");
  });

  it("day-7 conversion links to subscribe", () => {
    const html = renderDay7ConversionHtml({
      subscribeUrl: "https://app.inteloop.test/dashboard/settings",
    });
    expect(html).toContain("https://app.inteloop.test/dashboard/settings");
    expect(html.toLowerCase()).toContain("subscribe");
  });

  it("cancellation survey + cancelled emails link to the survey", () => {
    const survey = renderCancellationSurveyHtml({ surveyUrl: "https://survey.example/x" });
    expect(survey).toContain("https://survey.example/x");
    const cancelled = renderSubscriptionCancelledHtml({ surveyUrl: "https://survey.example/x" });
    expect(cancelled).toContain("https://survey.example/x");
  });

  it("escapes HTML in competitor names", () => {
    const html = renderDay5TeaserHtml({
      competitorNames: ["<script>"],
      dashboardUrl: "https://app.inteloop.test/dashboard/competitors",
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
