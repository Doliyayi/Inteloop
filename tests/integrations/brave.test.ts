import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBraveClient, type BraveClient } from "@/lib/integrations/brave";
import { startMockServer, type MockServer } from "../_helpers/mockServer";

const NEWS_BODY = {
  results: [
    {
      title: "Stripe launches new product",
      description: "A short summary of the launch.",
      url: "https://stripe.com/news/launch",
      page_age: "2026-06-13T12:00:00Z",
    },
    {
      title: "Stripe hires CFO",
      description: "Exec change announcement.",
      url: "https://example.com/news/cfo",
      age: "1 day ago",
    },
  ],
};

const WEB_BODY = {
  web: {
    results: [
      {
        title: "Stripe — pricing",
        description: "Stripe's pricing page",
        url: "https://stripe.com/pricing",
      },
    ],
  },
};

describe("Brave Search", () => {
  let server: MockServer;
  let client: BraveClient;

  beforeEach(async () => {
    server = await startMockServer();
    client = createBraveClient({
      apiKey: "test-token",
      baseUrl: server.url,
      timeoutMs: 200,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it("hits the news endpoint with freshness wired into the query string", async () => {
    server.setHandler(() => ({ status: 200, body: NEWS_BODY }));

    const result = await client.search("Stripe news", { freshness: "pm", count: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toMatchObject({
        title: "Stripe launches new product",
        url: "https://stripe.com/news/launch",
        snippet: "A short summary of the launch.",
        date: "2026-06-13T12:00:00Z",
      });
    }

    const request = server.requests[0]!;
    expect(request.method).toBe("GET");
    expect(request.url?.startsWith("/res/v1/news/search?")).toBe(true);
    expect(request.url).toContain("freshness=pm");
    expect(request.url).toContain("count=5");
    // URLSearchParams encodes spaces as '+', not '%20'.
    expect(request.url).toContain("q=Stripe+news");
    expect(request.headers["x-subscription-token"]).toBe("test-token");
  });

  it("hits the web endpoint when type=web is passed", async () => {
    server.setHandler(() => ({ status: 200, body: WEB_BODY }));

    const result = await client.search("Stripe site:stripe.com", {
      type: "web",
      freshness: "pw",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.url).toBe("https://stripe.com/pricing");
    }
    expect(server.requests[0]?.url?.startsWith("/res/v1/web/search?")).toBe(true);
  });

  it("returns blocked on a 429/4xx response", async () => {
    server.setHandler(() => ({ status: 429, body: "rate limited" }));

    const result = await client.search("Stripe news");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("blocked");
      expect(result.status).toBe(429);
    }
  });

  it("returns outage on a 5xx response", async () => {
    server.setHandler(() => ({ status: 503, body: "down" }));

    const result = await client.search("Stripe news");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("outage");
      expect(result.status).toBe(503);
    }
  });

  it("returns timeout when the server delays past timeoutMs", async () => {
    server.setHandler(() => ({ status: 200, body: NEWS_BODY, delayMs: 500 }));

    const result = await client.search("Stripe news");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");
  });

  it("skips hits missing url/title rather than erroring", async () => {
    server.setHandler(() => ({
      status: 200,
      body: {
        results: [
          { title: "ok", description: "fine", url: "https://x.com" },
          { title: "no url", description: "missing url" },
          { url: "https://y.com", description: "no title" },
        ],
      },
    }));

    const result = await client.search("Stripe news");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.results).toHaveLength(1);
  });

  it("returns unknown when the body is not JSON", async () => {
    server.setHandler(() => ({
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "not json at all",
    }));

    const result = await client.search("Stripe news");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unknown");
  });
});
