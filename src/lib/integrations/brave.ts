import "server-only";

const DEFAULT_BASE_URL = "https://api.search.brave.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_COUNT = 5; // PRD §8.3 / §9.3: top 5 results

export type BraveFreshness = "pd" | "pw" | "pm" | "py";
export type BraveSearchType = "web" | "news";

export type BraveConfig = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export type BraveSearchOptions = {
  freshness?: BraveFreshness;
  count?: number;
  type?: BraveSearchType;
};

export type BraveSearchResult = {
  title: string;
  snippet: string;
  url: string;
  date?: string;
};

export type BraveSearchSuccess = {
  ok: true;
  results: BraveSearchResult[];
};

export type BraveSearchFailure = {
  ok: false;
  reason: "blocked" | "outage" | "timeout" | "unknown";
  status?: number;
  error?: string;
};

export type BraveSearchResponse = BraveSearchSuccess | BraveSearchFailure;

type RawHit = {
  title?: string;
  description?: string;
  url?: string;
  age?: string;
  page_age?: string;
};

type RawResponse = {
  web?: { results?: RawHit[] };
  news?: { results?: RawHit[] };
  results?: RawHit[];
};

function normalise(hit: RawHit): BraveSearchResult | null {
  if (!hit.url || !hit.title) return null;
  const date = hit.page_age ?? hit.age;
  return {
    title: hit.title,
    snippet: hit.description ?? "",
    url: hit.url,
    ...(date ? { date } : {}),
  };
}

function extractResults(body: RawResponse, type: BraveSearchType): BraveSearchResult[] {
  // Brave's news endpoint returns `results` at the top level; web returns `web.results`.
  const raw =
    type === "news"
      ? (body.news?.results ?? body.results ?? [])
      : (body.web?.results ?? body.results ?? []);
  const out: BraveSearchResult[] = [];
  for (const hit of raw) {
    const item = normalise(hit);
    if (item) out.push(item);
  }
  return out;
}

export type BraveClient = {
  search(query: string, options?: BraveSearchOptions): Promise<BraveSearchResponse>;
};

export function createBraveClient(config: BraveConfig): BraveClient {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function search(
    query: string,
    options: BraveSearchOptions = {},
  ): Promise<BraveSearchResponse> {
    const type = options.type ?? "news";
    const count = options.count ?? DEFAULT_COUNT;
    const endpoint = type === "news" ? "/res/v1/news/search" : "/res/v1/web/search";

    const params = new URLSearchParams({ q: query, count: String(count) });
    if (options.freshness) params.set("freshness", options.freshness);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}${endpoint}?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": config.apiKey,
        },
      });

      if (res.status >= 500) {
        return { ok: false, reason: "outage", status: res.status };
      }
      if (res.status >= 400) {
        return { ok: false, reason: "blocked", status: res.status };
      }

      const body = (await res.json().catch(() => null)) as RawResponse | null;
      if (!body) {
        return { ok: false, reason: "unknown", status: res.status };
      }

      return { ok: true, results: extractResults(body, type) };
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

  return { search };
}

let defaultClient: BraveClient | null = null;
export function brave(): BraveClient {
  if (!defaultClient) {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY is not set.");
    defaultClient = createBraveClient({ apiKey });
  }
  return defaultClient;
}
