import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

import {
  buildBattlecardPrompt,
  buildDailyPrompt,
  buildWeeklyPrompt,
  buildWelcomePrompt,
  truncateScrapedContent,
  type BattlecardPromptInput,
  type CompetitorInput,
  type DailyPromptInput,
  type PromptPair,
  type WeeklyPromptInput,
  type WelcomePromptInput,
} from "./prompts";
import {
  battlecardSchema,
  dailyBriefingSchema,
  weeklyReportSchema,
  welcomeReportSchema,
  type Battlecard,
  type DailyBriefing,
  type WeeklyReport,
  type WelcomeReport,
} from "./schemas";

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 60_000;
// PRD §21.2 rate-limit backoff: 1 min, 5 min, 15 min.
const DEFAULT_RATE_LIMIT_BACKOFF_MS = [60_000, 300_000, 900_000];
// PRD §21.2 context-length recovery: truncate to 2000 words per competitor.
const DEFAULT_MAX_WORDS_PER_COMPETITOR = 2000;

export type GeneratorConfig = {
  apiKey: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  // [60_000, 300_000, 900_000] per PRD §21.2. Tests override with small values.
  rateLimitBackoffMs?: number[];
  // PRD §21.2: "Retry with explicit 'return valid JSON only' instruction".
  maxJsonRetries?: number;
  // PRD §21.2: "Retry once, then log to report_errors".
  maxTimeoutRetries?: number;
  // PRD §21.2 truncation budget.
  maxWordsPerCompetitor?: number;
};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
};

export type GeneratorSuccess<T> = {
  ok: true;
  data: T;
  usage: Usage;
  model: string;
  attempts: number;
};

export type GeneratorFailure = {
  ok: false;
  reason: "rate_limited" | "invalid_json" | "timeout" | "context_length" | "auth" | "unknown";
  status?: number;
  error?: string;
  attempts: number;
};

export type GeneratorResult<T> = GeneratorSuccess<T> | GeneratorFailure;

type ReportType = "welcome" | "weekly" | "battlecard" | "daily";
type AnyInput = WelcomePromptInput | WeeklyPromptInput | BattlecardPromptInput | DailyPromptInput;

function extractCompetitorList(type: ReportType, input: AnyInput): CompetitorInput[] {
  if (type === "battlecard") return [(input as BattlecardPromptInput).competitor];
  return (input as WelcomePromptInput | WeeklyPromptInput | DailyPromptInput).competitors;
}

function withTruncatedCompetitors(type: ReportType, input: AnyInput, maxWords: number): AnyInput {
  const competitors = truncateScrapedContent(extractCompetitorList(type, input), maxWords);
  if (type === "battlecard") {
    const first = competitors[0];
    if (!first) return input;
    return { competitor: first } as BattlecardPromptInput;
  }
  if (type === "welcome" || type === "daily") {
    return { competitors } as WelcomePromptInput;
  }
  return {
    competitors,
    previous_report_summary: (input as WeeklyPromptInput).previous_report_summary,
  } as WeeklyPromptInput;
}

function buildPromptFor(type: ReportType, input: AnyInput, extraInstruction: string): PromptPair {
  let pair: PromptPair;
  switch (type) {
    case "welcome":
      pair = buildWelcomePrompt(input as WelcomePromptInput);
      break;
    case "weekly":
      pair = buildWeeklyPrompt(input as WeeklyPromptInput);
      break;
    case "battlecard":
      pair = buildBattlecardPrompt(input as BattlecardPromptInput);
      break;
    case "daily":
      pair = buildDailyPrompt(input as DailyPromptInput);
      break;
  }
  if (extraInstruction) {
    return { system: pair.system, user: `${pair.user}\n\n${extraInstruction}` };
  }
  return pair;
}

function parseJsonOrThrow(text: string): unknown {
  // Claude sometimes wraps output in ```json fences despite instructions.
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(stripped);
}

function isContextLengthError(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false;
  if (err.status !== 400) return false;
  const message = (err.message ?? "").toLowerCase();
  return message.includes("context") || message.includes("max_tokens");
}

function classifyApiError(err: unknown): GeneratorFailure["reason"] {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.AuthenticationError) return "auth";
  if (isContextLengthError(err)) return "context_length";
  return "unknown";
}

export type Generator = {
  welcome(input: WelcomePromptInput): Promise<GeneratorResult<WelcomeReport>>;
  weekly(input: WeeklyPromptInput): Promise<GeneratorResult<WeeklyReport>>;
  battlecard(input: BattlecardPromptInput): Promise<GeneratorResult<Battlecard>>;
  daily(input: DailyPromptInput): Promise<GeneratorResult<DailyBriefing>>;
};

export function createReportGenerator(config: GeneratorConfig): Generator {
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: 0, // SDK-level retries off — we handle them per PRD §21.2 here.
  });
  const model = config.model ?? DEFAULT_MODEL;
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  const backoff = config.rateLimitBackoffMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS;
  const maxJsonRetries = config.maxJsonRetries ?? 1;
  const maxTimeoutRetries = config.maxTimeoutRetries ?? 1;
  const maxWordsPerCompetitor = config.maxWordsPerCompetitor ?? DEFAULT_MAX_WORDS_PER_COMPETITOR;

  async function callOnce(prompt: PromptPair): Promise<{ text: string; usage: Usage }> {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });

    const textBlock = response.content.find((c) => c.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";

    return {
      text,
      usage: {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
      },
    };
  }

  async function run<T>(
    type: ReportType,
    input: AnyInput,
    schema: z.ZodType<T>,
  ): Promise<GeneratorResult<T>> {
    let attempts = 0;
    let jsonRetries = 0;
    let timeoutRetries = 0;
    let truncated = false;
    let backoffIndex = 0;
    let activeInput = input;
    let extraInstruction = "";

    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempts += 1;
      const prompt = buildPromptFor(type, activeInput, extraInstruction);

      let callResult: { text: string; usage: Usage };
      try {
        callResult = await callOnce(prompt);
      } catch (err) {
        const reason = classifyApiError(err);
        const status = err instanceof Anthropic.APIError ? (err.status ?? undefined) : undefined;
        const message = err instanceof Error ? err.message : String(err);

        if (reason === "rate_limited") {
          if (backoffIndex >= backoff.length) {
            return { ok: false, reason, status, error: message, attempts };
          }
          const delay = backoff[backoffIndex] ?? 0;
          backoffIndex += 1;
          if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (reason === "timeout") {
          if (timeoutRetries >= maxTimeoutRetries) {
            return { ok: false, reason, error: message, attempts };
          }
          timeoutRetries += 1;
          continue;
        }

        if (reason === "context_length" && !truncated) {
          activeInput = withTruncatedCompetitors(type, activeInput, maxWordsPerCompetitor);
          truncated = true;
          continue;
        }

        return { ok: false, reason, status, error: message, attempts };
      }

      // 2xx — validate the JSON.
      let parsed: unknown;
      try {
        parsed = parseJsonOrThrow(callResult.text);
      } catch (parseErr) {
        if (jsonRetries >= maxJsonRetries) {
          return {
            ok: false,
            reason: "invalid_json",
            error: parseErr instanceof Error ? parseErr.message : String(parseErr),
            attempts,
          };
        }
        jsonRetries += 1;
        extraInstruction =
          "IMPORTANT: Your previous response was not valid JSON. Return valid JSON only — no commentary, no markdown fences.";
        continue;
      }

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        if (jsonRetries >= maxJsonRetries) {
          return {
            ok: false,
            reason: "invalid_json",
            error: validated.error.message,
            attempts,
          };
        }
        jsonRetries += 1;
        extraInstruction = `IMPORTANT: Your previous JSON did not match the required schema. Return valid JSON only — no commentary, no markdown fences. Schema error: ${validated.error.message.slice(0, 400)}`;
        continue;
      }

      return {
        ok: true,
        data: validated.data,
        usage: callResult.usage,
        model,
        attempts,
      };
    }
  }

  return {
    welcome: (input) => run("welcome", input, welcomeReportSchema),
    weekly: (input) => run("weekly", input, weeklyReportSchema),
    battlecard: (input) => run("battlecard", input, battlecardSchema),
    daily: (input) => run("daily", input, dailyBriefingSchema),
  };
}

export type { WelcomeReport, WeeklyReport, Battlecard };
export { welcomeReportSchema, weeklyReportSchema, battlecardSchema };
