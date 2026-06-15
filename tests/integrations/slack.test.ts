import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSlackNotifier,
  formatMajorChangeAlert,
  isValidSlackWebhookUrl,
  type SlackNotifier,
} from "@/lib/integrations/slack";
import { startMockServer, type MockServer } from "../_helpers/mockServer";

describe("isValidSlackWebhookUrl (PRD §12.3)", () => {
  it("accepts a real Slack incoming webhook URL", () => {
    expect(isValidSlackWebhookUrl("https://hooks.slack.com/services/T000/B000/XXXX")).toBe(true);
  });

  it("rejects non-Slack domains and bad input", () => {
    expect(isValidSlackWebhookUrl("https://evil.example/services/x")).toBe(false);
    expect(isValidSlackWebhookUrl("http://hooks.slack.com/services/x")).toBe(false); // not https
    expect(isValidSlackWebhookUrl("https://hooks.slack.com/other")).toBe(false); // wrong path
    expect(isValidSlackWebhookUrl("not a url")).toBe(false);
    expect(isValidSlackWebhookUrl("")).toBe(false);
  });
});

describe("formatMajorChangeAlert (PRD §12.2)", () => {
  it("includes the summary and a report link", () => {
    const msg = formatMajorChangeAlert({
      summary: "Acme launched a new pricing tier.",
      reportUrl: "https://app.inteloop.com/dashboard/reports/r1",
    });
    expect(msg.text).toContain("Inteloop Alert");
    expect(msg.text).toContain("Acme launched a new pricing tier.");
    expect(msg.text).toContain("https://app.inteloop.com/dashboard/reports/r1");
  });
});

describe("Slack notifier", () => {
  let server: MockServer;
  let notifier: SlackNotifier;

  beforeEach(async () => {
    server = await startMockServer();
    notifier = createSlackNotifier({ timeoutMs: 300 });
  });

  afterEach(async () => {
    await server.close();
  });

  it("short-circuits an invalid URL without making a request", async () => {
    const result = await notifier.send("https://evil.example/x", { text: "hi" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_url");
    expect(server.requests).toHaveLength(0);
  });

  it("posts the message text on a 2xx response", async () => {
    server.setHandler(() => ({ status: 200, body: "ok" }));
    // Override the URL guard so we can target the mock server.
    const testNotifier = createSlackNotifier({ timeoutMs: 300, validateUrl: () => true });
    const result = await testNotifier.send(server.url, { text: "hello team" });
    expect(result.ok).toBe(true);
    expect(JSON.parse(server.requests[0]!.body)).toEqual({ text: "hello team" });
  });

  it("maps a non-2xx Slack response to 'rejected'", async () => {
    server.setHandler(() => ({ status: 404, body: "no_service" }));
    const testNotifier = createSlackNotifier({ timeoutMs: 300, validateUrl: () => true });
    const result = await testNotifier.send(server.url, { text: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("rejected");
      expect(result.status).toBe(404);
    }
  });
});
