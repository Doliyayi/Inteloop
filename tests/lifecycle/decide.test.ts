import { describe, expect, it } from "vitest";

import { decideTrialEmail } from "@/lib/lifecycle/workflow";

const base = { day5Sent: false, day7Sent: false, hasCompetitors: true };

describe("decideTrialEmail (PRD §18 day-5 / day-7)", () => {
  it("sends nothing before day 5", () => {
    expect(decideTrialEmail({ ...base, ageDays: 4 })).toBeNull();
  });

  it("sends the day-5 teaser at day 5 when competitors exist", () => {
    expect(decideTrialEmail({ ...base, ageDays: 5 })).toBe("day5_teaser");
  });

  it("skips the day-5 teaser when there are no competitors", () => {
    expect(decideTrialEmail({ ...base, ageDays: 5, hasCompetitors: false })).toBeNull();
  });

  it("does not resend the day-5 teaser", () => {
    expect(decideTrialEmail({ ...base, ageDays: 6, day5Sent: true })).toBeNull();
  });

  it("sends the day-7 conversion at day 7, even if the teaser never went out", () => {
    expect(decideTrialEmail({ ...base, ageDays: 7, day5Sent: false })).toBe("day7_conversion");
    expect(decideTrialEmail({ ...base, ageDays: 8, day5Sent: true })).toBe("day7_conversion");
  });

  it("sends day-7 conversion regardless of competitors", () => {
    expect(decideTrialEmail({ ...base, ageDays: 9, hasCompetitors: false })).toBe(
      "day7_conversion",
    );
  });

  it("does not resend the day-7 conversion", () => {
    expect(decideTrialEmail({ ...base, ageDays: 9, day7Sent: true })).toBeNull();
  });
});
