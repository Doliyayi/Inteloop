import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createReportGenerator, type Generator } from "@/lib/reports/generator";
import { WELCOME_CLOSING_LINE } from "@/lib/reports/schemas";
import { startMockServer, type MockServer } from "../_helpers/mockServer";

function anthropicMessage(text: string, usage = { input_tokens: 100, output_tokens: 200 }) {
  return {
    status: 200,
    body: {
      id: "msg_test_1",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-5",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage,
    },
  };
}

function anthropicError(status: number, type: string, message: string) {
  return {
    status,
    body: { type: "error", error: { type, message } },
  };
}

function validWelcomeJson(): string {
  return JSON.stringify({
    competitors: [
      {
        name: "Stripe",
        snapshot: "Payments infra.",
        news: [],
        website_signals: "x",
        what_to_watch: ["a", "b", "c"],
        scrape_limited: false,
      },
    ],
    closing_line: WELCOME_CLOSING_LINE,
  });
}

const welcomeInput = {
  competitors: [
    {
      name: "Stripe",
      website_url: "https://stripe.com",
      news: [],
    },
  ],
};

describe("ReportGenerator — happy path", () => {
  let server: MockServer;
  let generator: Generator;

  beforeEach(async () => {
    server = await startMockServer();
    generator = createReportGenerator({
      apiKey: "test-key",
      baseURL: server.url,
      timeoutMs: 1000,
      rateLimitBackoffMs: [5, 10, 15],
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it("parses a conformant welcome response and returns usage stats", async () => {
    server.setResponses([anthropicMessage(validWelcomeJson())]);

    const result = await generator.welcome(welcomeInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.closing_line).toBe(WELCOME_CLOSING_LINE);
      expect(result.data.competitors).toHaveLength(1);
      expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 200 });
      expect(result.attempts).toBe(1);
    }
    expect(server.requests).toHaveLength(1);
  });

  it("strips ```json fences before parsing", async () => {
    server.setResponses([anthropicMessage("```json\n" + validWelcomeJson() + "\n```")]);

    const result = await generator.welcome(welcomeInput);
    expect(result.ok).toBe(true);
  });
});

describe("ReportGenerator — PRD §21.2 error handling", () => {
  let server: MockServer;
  let generator: Generator;

  beforeEach(async () => {
    server = await startMockServer();
    generator = createReportGenerator({
      apiKey: "test-key",
      baseURL: server.url,
      timeoutMs: 1000,
      // Compress the PRD-prescribed [60_000, 300_000, 900_000] to keep tests fast.
      rateLimitBackoffMs: [5, 10, 15],
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it("retries on 429 and succeeds on the 2nd attempt", async () => {
    server.setResponses([
      anthropicError(429, "rate_limit_error", "Rate limit exceeded"),
      anthropicMessage(validWelcomeJson()),
    ]);

    const result = await generator.welcome(welcomeInput);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attempts).toBe(2);
    expect(server.requests).toHaveLength(2);
  });

  it("returns rate_limited after exhausting the backoff schedule", async () => {
    server.setResponses([
      anthropicError(429, "rate_limit_error", "Rate limit exceeded"),
      anthropicError(429, "rate_limit_error", "Rate limit exceeded"),
      anthropicError(429, "rate_limit_error", "Rate limit exceeded"),
      anthropicError(429, "rate_limit_error", "Rate limit exceeded"),
    ]);

    const result = await generator.welcome(welcomeInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("rate_limited");
      // 3 backoff slots + 1 final failed attempt = 4 calls.
      expect(result.attempts).toBe(4);
    }
  });

  it("retries when the response is not valid JSON and succeeds on the 2nd attempt", async () => {
    server.setResponses([
      anthropicMessage("here's your report: not actually json"),
      anthropicMessage(validWelcomeJson()),
    ]);

    const result = await generator.welcome(welcomeInput);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attempts).toBe(2);

    // The second prompt should include the "return valid JSON only" reminder.
    const secondBody = JSON.parse(server.requests[1]!.body);
    expect(secondBody.messages[0].content).toContain("valid JSON only");
  });

  it("returns invalid_json after exhausting JSON retries", async () => {
    server.setResponses([anthropicMessage("not json"), anthropicMessage("still not json")]);

    const result = await generator.welcome(welcomeInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_json");
      expect(result.attempts).toBe(2);
    }
  });

  it("retries when the JSON is well-formed but fails schema validation", async () => {
    const wrongClosingLine = JSON.stringify({
      competitors: [
        {
          name: "Stripe",
          snapshot: "x",
          news: [],
          website_signals: "x",
          what_to_watch: [],
          scrape_limited: false,
        },
      ],
      closing_line: "Something else.",
    });

    server.setResponses([anthropicMessage(wrongClosingLine), anthropicMessage(validWelcomeJson())]);

    const result = await generator.welcome(welcomeInput);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attempts).toBe(2);

    // Reminder for the second attempt should reference the schema error.
    const secondBody = JSON.parse(server.requests[1]!.body);
    expect(secondBody.messages[0].content).toMatch(/schema/i);
  });

  it("truncates competitor content to 2000 words on context_length error and retries", async () => {
    const generatorWithSmallBudget = createReportGenerator({
      apiKey: "test-key",
      baseURL: server.url,
      timeoutMs: 1000,
      rateLimitBackoffMs: [5, 10, 15],
      maxWordsPerCompetitor: 50,
    });

    server.setResponses([
      anthropicError(400, "invalid_request_error", "prompt is too long for context window"),
      anthropicMessage(validWelcomeJson()),
    ]);

    const longContent = Array.from({ length: 500 }, (_, i) => `word${i}`).join(" ");
    const result = await generatorWithSmallBudget.welcome({
      competitors: [
        {
          name: "Stripe",
          website_url: "https://stripe.com",
          scraped_content: longContent,
          news: [],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attempts).toBe(2);

    // Second request body should contain the truncated content.
    const secondBody = JSON.parse(server.requests[1]!.body);
    const userContent: string = secondBody.messages[0].content;
    // After truncation, the content has 50 words. Original had 500.
    // Pick a word that should have survived ("word0") and one that should NOT ("word400").
    expect(userContent).toContain("word0 ");
    expect(userContent).not.toContain("word400");
  });

  it("returns auth on 401", async () => {
    server.setResponses([anthropicError(401, "authentication_error", "invalid x-api-key")]);

    const result = await generator.welcome(welcomeInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("auth");
  });

  it("returns unknown on a 500", async () => {
    server.setResponses([anthropicError(500, "api_error", "internal server error")]);

    const result = await generator.welcome(welcomeInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unknown");
  });
});

describe("ReportGenerator — replay batch", () => {
  let server: MockServer;
  let generator: Generator;

  beforeEach(async () => {
    server = await startMockServer();
    generator = createReportGenerator({
      apiKey: "test-key",
      baseURL: server.url,
      timeoutMs: 1000,
      rateLimitBackoffMs: [5, 10, 15],
      maxJsonRetries: 0, // for this gate we want a clear pass/fail per fixture
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it("replays 10 fixtures (8 valid, 2 malformed) — stored reports always conform to schema", async () => {
    const validFixture = validWelcomeJson();
    const malformedFixture = "{ this is not valid json";
    const fixtures = [
      validFixture,
      validFixture,
      malformedFixture,
      validFixture,
      validFixture,
      validFixture,
      malformedFixture,
      validFixture,
      validFixture,
      validFixture,
    ];

    const results: ("ok" | "invalid_json")[] = [];
    for (const fixture of fixtures) {
      server.setResponses([anthropicMessage(fixture)]);
      const result = await generator.welcome(welcomeInput);
      results.push(result.ok ? "ok" : (result.reason as "invalid_json"));
    }

    expect(results.filter((r) => r === "ok")).toHaveLength(8);
    expect(results.filter((r) => r === "invalid_json")).toHaveLength(2);
  });
});
