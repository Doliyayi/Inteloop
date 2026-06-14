import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  countWords,
  createFirecrawlClient,
  type FirecrawlClient,
} from "@/lib/integrations/firecrawl";
import { startMockServer, type MockServer } from "../_helpers/mockServer";

function longMarkdown(words: number): string {
  return Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
}

describe("countWords", () => {
  it("returns 0 for empty / whitespace-only input", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n  ")).toBe(0);
  });

  it("counts whitespace-separated tokens", () => {
    expect(countWords("hello")).toBe(1);
    expect(countWords("hello world")).toBe(2);
    expect(countWords("a\nb\tc d")).toBe(4);
  });
});

describe("Firecrawl scrape (PRD §21.1)", () => {
  let server: MockServer;
  let client: FirecrawlClient;

  beforeEach(async () => {
    server = await startMockServer();
    client = createFirecrawlClient({
      apiKey: "test-key",
      baseUrl: server.url,
      timeoutMs: 200,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns ok with scrape_limited=false when markdown ≥ 200 words", async () => {
    server.setHandler(() => ({
      status: 200,
      body: { success: true, data: { markdown: longMarkdown(250) } },
    }));

    const result = await client.scrape("https://acme.example");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.wordCount).toBe(250);
      expect(result.scrapeLimited).toBe(false);
    }
  });

  it("returns ok with scrape_limited=true when markdown < 200 words", async () => {
    server.setHandler(() => ({
      status: 200,
      body: { success: true, data: { markdown: longMarkdown(150) } },
    }));

    const result = await client.scrape("https://acme.example");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.wordCount).toBe(150);
      expect(result.scrapeLimited).toBe(true);
    }
  });

  it("returns blocked on a 4xx bot-protection response", async () => {
    server.setHandler(() => ({ status: 403, body: "forbidden" }));

    const result = await client.scrape("https://acme.example");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("blocked");
      expect(result.status).toBe(403);
    }
  });

  it("returns outage on a 5xx response", async () => {
    server.setHandler(() => ({ status: 502, body: "bad gateway" }));

    const result = await client.scrape("https://acme.example");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("outage");
      expect(result.status).toBe(502);
    }
  });

  it("returns timeout when the server delays past timeoutMs", async () => {
    server.setHandler(() => ({ status: 200, body: "{}", delayMs: 500 }));

    const result = await client.scrape("https://acme.example");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");
  });

  it("treats {success:false} body as unknown failure and surfaces the error", async () => {
    server.setHandler(() => ({
      status: 200,
      body: { success: false, error: "blocked by robots.txt" },
    }));

    const result = await client.scrape("https://acme.example");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unknown");
      expect(result.error).toBe("blocked by robots.txt");
    }
  });

  it("sends Authorization: Bearer <key>", async () => {
    server.setHandler(() => ({
      status: 200,
      body: { success: true, data: { markdown: longMarkdown(250) } },
    }));

    await client.scrape("https://acme.example");

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.headers["authorization"]).toBe("Bearer test-key");
    expect(server.requests[0]?.method).toBe("POST");
    expect(server.requests[0]?.url).toBe("/v1/scrape");
  });

  it("retries on 5xx when maxRetries > 0 and succeeds on the 2nd attempt", async () => {
    const retryClient = createFirecrawlClient({
      apiKey: "test-key",
      baseUrl: server.url,
      timeoutMs: 200,
      maxRetries: 1,
      retryDelayMs: 10,
    });
    server.setResponses([
      { status: 502, body: "bad gateway" },
      {
        status: 200,
        body: { success: true, data: { markdown: longMarkdown(250) } },
      },
    ]);

    const result = await retryClient.scrape("https://acme.example");
    expect(result.ok).toBe(true);
    expect(server.requests).toHaveLength(2);
  });

  it("does not retry on a 4xx response, even when maxRetries > 0", async () => {
    const retryClient = createFirecrawlClient({
      apiKey: "test-key",
      baseUrl: server.url,
      timeoutMs: 200,
      maxRetries: 3,
      retryDelayMs: 10,
    });
    server.setResponses([{ status: 403, body: "forbidden" }]);

    const result = await retryClient.scrape("https://acme.example");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("blocked");
    expect(server.requests).toHaveLength(1);
  });
});
