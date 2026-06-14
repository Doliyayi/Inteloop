import { z } from "zod";

// =========================================================
// Schemas for Claude responses per PRD §19.
// Required fields are enforced strictly; format hints (URL,
// ISO date) are lenient because Claude occasionally produces
// near-but-not-exact values and we'd rather store the result
// than reject the whole report.
// =========================================================

const newsItemSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  date: z.string(),
  url: z.string(),
});

// =========================================================
// Welcome report — PRD §19.1
// =========================================================
export const welcomeCompetitorSchema = z.object({
  name: z.string(),
  snapshot: z.string(),
  news: z.array(newsItemSchema),
  website_signals: z.string(),
  what_to_watch: z.array(z.string()),
  scrape_limited: z.boolean(),
});

// PRD §8.2: "The closing line of every welcome report must be: ..."
export const WELCOME_CLOSING_LINE =
  "This is your baseline. Every Monday we'll show you what changed.";

export const welcomeReportSchema = z.object({
  competitors: z.array(welcomeCompetitorSchema),
  closing_line: z.literal(WELCOME_CLOSING_LINE),
});

// =========================================================
// Weekly report — PRD §19.2
// =========================================================
export const weeklyCompetitorSchema = z.object({
  name: z.string(),
  weekly_delta: z.string(),
  news: z.array(newsItemSchema),
  messaging_changes: z.string().nullable(),
  strategic_implications: z.string(),
  signals_to_watch: z.array(z.string()),
});

export const weeklyReportSchema = z.object({
  report_date: z.string(),
  executive_summary: z.array(z.string()).max(5),
  major_change: z.boolean(),
  major_change_summary: z.string().nullable(),
  competitors: z.array(weeklyCompetitorSchema),
});

// =========================================================
// Battlecard — PRD §19.3
// =========================================================
export const battlecardSchema = z.object({
  competitor_name: z.string(),
  positioning: z.string(),
  strengths: z.array(z.string()).max(3),
  weaknesses: z.array(z.string()).max(3),
  pricing: z.string(),
  key_differentiators: z.array(z.string()),
  how_to_win: z.array(z.string()).max(5),
  landmines: z.array(z.string()),
  generated_at: z.string(),
});

export type WelcomeReport = z.infer<typeof welcomeReportSchema>;
export type WeeklyReport = z.infer<typeof weeklyReportSchema>;
export type Battlecard = z.infer<typeof battlecardSchema>;

export type ReportSchemaByType = {
  welcome: typeof welcomeReportSchema;
  weekly: typeof weeklyReportSchema;
  battlecard: typeof battlecardSchema;
};

export const reportSchemas: ReportSchemaByType = {
  welcome: welcomeReportSchema,
  weekly: weeklyReportSchema,
  battlecard: battlecardSchema,
};
