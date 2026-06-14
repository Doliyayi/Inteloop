import "server-only";

const DEFAULT_BASE_URL = "https://api.firecrawl.dev";
const DEFAULT_TIMEOUT_MS = 30_000; // PRD §21.1: abort if > 30s
const SCRAPE_LIMITED_WORD_THRESHOLD = 200; // PRD §21.1: < 200 words → scrape_limited

export type FirecrawlConfig = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  // Caller retry policy. Default is no retry — orchestrators (M6/M7) wrap
  // the call with the PRD §21.1 5-minute retry, but tests can dial it down.
  maxRetries?: number;
  retryDelayMs?: number;
};

export type ScrapeSuccess = {
  ok: true;
  markdown: string;
  wordCount: number;
  scrapeLimited: boolean;
};

export type ScrapeFailure = {
  ok: false;
  reason: "blocked" | "outage" | "timeout" | "unknown";
  status?: number;
  error?: string;
};

export type ScrapeResult = ScrapeSuccess | ScrapeFailure;

export function countWords(markdown: string): number {
  const trimmed = markdown.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export type FirecrawlClient = {
  scrape(url: string): Promise<ScrapeResult>;
};

export function createFirecrawlClient(config: FirecrawlConfig): FirecrawlClient {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = Math.max(0, config.maxRetries ?? 0);
  const retryDelayMs = Math.max(0, config.retryDelayMs ?? 0);

  async function attempt(url: string): Promise<ScrapeResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/v1/scrape`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ url, formats: ["markdown"] }),
      });

      if (res.status >= 500) {
        return { ok: false, reason: "outage", status: res.status };
      }
      if (res.status >= 400) {
        return { ok: false, reason: "blocked", status: res.status };
      }

      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: { markdown?: string };
        error?: string;
      } | null;

      if (!body || body.success === false) {
        return {
          ok: false,
          reason: "unknown",
          status: res.status,
          ...(body?.error ? { error: body.error } : {}),
        };
      }

      const markdown = body.data?.markdown ?? "";
      const wordCount = countWords(markdown);
      return {
        ok: true,
        markdown,
        wordCount,
        scrapeLimited: wordCount < SCRAPE_LIMITED_WORD_THRESHOLD,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, reason: "timeout" };
      }
      return {
        ok: false,
        reason: "unknown",
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function scrape(url: string): Promise<ScrapeResult> {
    let last: ScrapeResult = await attempt(url);
    let retries = 0;
    // Per PRD §21.1, only 5xx outages are eligible for retry. Bot-blocks (4xx)
    // and timeouts go straight to the Brave Search fallback in the orchestrator.
    while (!last.ok && last.reason === "outage" && retries < maxRetries) {
      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
      retries += 1;
      last = await attempt(url);
    }
    return last;
  }

  return { scrape };
}

// Convenience singleton bound to env vars. Lazily instantiated so tests that
// never call it don't need the env present.
let defaultClient: FirecrawlClient | null = null;
export function firecrawl(): FirecrawlClient {
  if (!defaultClient) {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set.");
    defaultClient = createFirecrawlClient({ apiKey });
  }
  return defaultClient;
}
