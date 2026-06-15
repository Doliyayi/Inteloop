import { describe, expect, it } from "vitest";

import { buildPreviousReportSummary } from "@/lib/reports/weeklyWorkflow";

describe("buildPreviousReportSummary (PRD §9.5)", () => {
  it("summarises a previous weekly report (exec bullets + per-competitor delta)", () => {
    const summary = buildPreviousReportSummary({
      report_date: "2026-06-08",
      executive_summary: ["Acme launched X.", "Globex quiet."],
      competitors: [
        { name: "Acme", weekly_delta: "Launched product X." },
        { name: "Globex", weekly_delta: "No change." },
      ],
    });
    expect(summary).toContain("- Acme launched X.");
    expect(summary).toContain("Acme: Launched product X.");
    expect(summary).toContain("Globex: No change.");
  });

  it("summarises a welcome report using snapshots", () => {
    const summary = buildPreviousReportSummary({
      competitors: [{ name: "Acme", snapshot: "Acme is a CRM vendor." }],
      closing_line: "This is your baseline. Every Monday we'll show you what changed.",
    });
    expect(summary).toContain("Acme: Acme is a CRM vendor.");
  });

  it("returns null for empty or non-object content", () => {
    expect(buildPreviousReportSummary(null)).toBeNull();
    expect(buildPreviousReportSummary({})).toBeNull();
    expect(buildPreviousReportSummary("text")).toBeNull();
  });

  it("truncates very long summaries", () => {
    const summary = buildPreviousReportSummary({
      competitors: Array.from({ length: 200 }, (_, i) => ({
        name: `Comp${i}`,
        weekly_delta: "x".repeat(50),
      })),
    });
    expect(summary).not.toBeNull();
    expect(summary!.length).toBeLessThanOrEqual(1_501);
    expect(summary!.endsWith("…")).toBe(true);
  });
});
