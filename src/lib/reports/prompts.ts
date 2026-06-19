// System prompts are verbatim from PRD §19.1 — §19.3.
// User messages follow the structure prescribed by PRD §19.1.

export type NewsHit = {
  title: string;
  snippet: string;
  url: string;
  date?: string;
};

export type CompetitorInput = {
  name: string;
  website_url: string;
  scraped_content?: string | null;
  news: NewsHit[];
};

export type WelcomePromptInput = {
  competitors: CompetitorInput[];
};

export type WeeklyPromptInput = {
  competitors: CompetitorInput[];
  previous_report_summary?: string | null;
};

export type BattlecardPromptInput = {
  competitor: CompetitorInput;
};

export type DailyPromptInput = {
  competitors: CompetitorInput[];
};

export type PromptPair = { system: string; user: string };

// =========================================================
// Welcome prompt (PRD §19.1)
// =========================================================
export const WELCOME_SYSTEM_PROMPT = `You are a competitive intelligence analyst. Your job is to write a first-impression \
competitor report for a B2B company that has just signed up for Inteloop. \
The goal is to make an excellent first impression — show that the platform is \
insightful and immediately useful. Write in a direct, professional tone. \
Do not use filler phrases or padding. Every sentence must contain a useful insight \
or observation.

Return a JSON object with the following structure:
{
  "competitors": [
    {
      "name": "string",
      "snapshot": "string (1 paragraph)",
      "news": [{"headline": "string", "summary": "string", "date": "string", "url": "string"}],
      "website_signals": "string (2-4 observations)",
      "what_to_watch": ["string", "string", "string"],
      "scrape_limited": boolean
    }
  ],
  "closing_line": "This is your baseline. Every Monday we'll show you what changed."
}`;

export const WEEKLY_SYSTEM_PROMPT = `You are a competitive intelligence analyst. Your job is to generate a weekly \
competitor intelligence briefing. Focus on CHANGE and DELTA — what is different \
from last week, not a static snapshot. Flag major changes explicitly using the \
major_change field. Write in a direct, professional tone.

Return a JSON object:
{
  "report_date": "string (YYYY-MM-DD)",
  "executive_summary": ["string (up to 5 bullets)"],
  "major_change": boolean,
  "major_change_summary": "string or null",
  "competitors": [
    {
      "name": "string",
      "weekly_delta": "string (what changed vs last week)",
      "news": [{"headline": "string", "summary": "string", "date": "string", "url": "string"}],
      "messaging_changes": "string or null",
      "strategic_implications": "string",
      "signals_to_watch": ["string"]
    }
  ]
}`;

export const BATTLECARD_SYSTEM_PROMPT = `You are a competitive intelligence analyst specialising in sales enablement. \
Generate a concise battlecard a sales rep can use in a competitive deal. \
Be specific and actionable. Do not use vague language.

Return a JSON object:
{
  "competitor_name": "string",
  "positioning": "string",
  "strengths": ["string (max 3)"],
  "weaknesses": ["string (max 3)"],
  "pricing": "string",
  "key_differentiators": ["string"],
  "how_to_win": ["string (max 5 talking points)"],
  "landmines": ["string (topics to avoid)"],
  "generated_at": "ISO timestamp"
}`;

// PRD §9.4: condensed, news-only daily briefing for Pro subscribers.
export const DAILY_SYSTEM_PROMPT = `You are a competitive intelligence analyst. Generate a SHORT daily \
briefing covering only notable NEWS about the tracked competitors from the last 24 hours. No deep \
analysis, no website teardown — just what happened and a one-line note on why it matters. If there \
is nothing notable for a competitor, omit it. Flag major changes explicitly with the major_change field.

Return a JSON object:
{
  "report_date": "string (YYYY-MM-DD)",
  "summary": "string (1-2 sentences across all competitors; if nothing notable, say so)",
  "major_change": boolean,
  "major_change_summary": "string or null",
  "items": [
    {"competitor": "string", "headline": "string", "summary": "string (1 sentence)", "url": "string"}
  ]
}`;

const JSON_ONLY_REMINDER =
  "Return ONLY the JSON object described above. Do not include explanatory text, code fences, or markdown.";

function formatCompetitorBlock(competitor: CompetitorInput): string {
  const lines: string[] = [`COMPETITOR: ${competitor.name}`, `WEBSITE: ${competitor.website_url}`];

  const content = competitor.scraped_content?.trim();
  lines.push(
    `SCRAPED CONTENT: ${
      content && content.length > 0 ? content : "Limited data — see scrape_limited flag"
    }`,
  );

  lines.push("NEWS:");
  if (competitor.news.length === 0) {
    lines.push("  (none)");
  } else {
    for (const item of competitor.news) {
      const datePart = item.date ? ` [${item.date}]` : "";
      lines.push(`  - ${item.title}${datePart}: ${item.snippet}`);
      lines.push(`    ${item.url}`);
    }
  }

  return lines.join("\n");
}

export function buildWelcomeUserMessage(input: WelcomePromptInput): string {
  const blocks = input.competitors.map(formatCompetitorBlock);
  return [
    "I need a welcome report for a new Inteloop customer.",
    "Their tracked competitors are:",
    "",
    blocks.join("\n\n"),
    "",
    JSON_ONLY_REMINDER,
  ].join("\n");
}

export function buildWeeklyUserMessage(input: WeeklyPromptInput): string {
  const blocks = input.competitors.map(formatCompetitorBlock);
  const previous = input.previous_report_summary?.trim();
  return [
    "I need a weekly competitor intelligence briefing.",
    previous
      ? `PREVIOUS WEEK SUMMARY (for delta analysis):\n${previous}`
      : "PREVIOUS WEEK SUMMARY: (none — this is the first weekly report)",
    "",
    "CURRENT WEEK DATA:",
    "",
    blocks.join("\n\n"),
    "",
    JSON_ONLY_REMINDER,
  ].join("\n");
}

export function buildBattlecardUserMessage(input: BattlecardPromptInput): string {
  return [
    "Generate a battlecard for the following competitor.",
    "",
    formatCompetitorBlock(input.competitor),
    "",
    JSON_ONLY_REMINDER,
  ].join("\n");
}

export function buildWelcomePrompt(input: WelcomePromptInput): PromptPair {
  return { system: WELCOME_SYSTEM_PROMPT, user: buildWelcomeUserMessage(input) };
}

export function buildWeeklyPrompt(input: WeeklyPromptInput): PromptPair {
  return { system: WEEKLY_SYSTEM_PROMPT, user: buildWeeklyUserMessage(input) };
}

export function buildBattlecardPrompt(input: BattlecardPromptInput): PromptPair {
  return { system: BATTLECARD_SYSTEM_PROMPT, user: buildBattlecardUserMessage(input) };
}

export function buildDailyUserMessage(input: DailyPromptInput): string {
  const blocks = input.competitors.map(formatCompetitorBlock);
  return [
    "I need a daily competitor news briefing (last 24 hours).",
    "",
    blocks.join("\n\n"),
    "",
    JSON_ONLY_REMINDER,
  ].join("\n");
}

export function buildDailyPrompt(input: DailyPromptInput): PromptPair {
  return { system: DAILY_SYSTEM_PROMPT, user: buildDailyUserMessage(input) };
}

// =========================================================
// Truncation per PRD §21.2 (context_length_exceeded recovery).
// =========================================================

export function truncateScrapedContent(
  competitors: CompetitorInput[],
  maxWordsPerCompetitor: number,
): CompetitorInput[] {
  return competitors.map((competitor) => {
    if (!competitor.scraped_content) return competitor;
    const words = competitor.scraped_content.trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWordsPerCompetitor) return competitor;
    return {
      ...competitor,
      scraped_content: words.slice(0, maxWordsPerCompetitor).join(" "),
    };
  });
}
