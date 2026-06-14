import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createResendClient, type ResendClient } from "@/lib/integrations/resend";
import { startMockServer, type MockServer } from "../_helpers/mockServer";

describe("Resend adapter (PRD §21.3 mapping)", () => {
  let server: MockServer;
  let client: ResendClient;

  beforeEach(async () => {
    server = await startMockServer();
    client = createResendClient({
      apiKey: "test-key",
      baseUrl: server.url,
      timeoutMs: 200,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns ok with the id on a 200 response", async () => {
    server.setHandler(() => ({ status: 200, body: { id: "msg_abc" } }));

    const result = await client.send({
      from: "noreply@inteloop.com",
      to: "user@example.com",
      subject: "Test",
      html: "<p>hi</p>",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.id).toBe("msg_abc");

    const request = server.requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/emails");
    expect(request.headers["authorization"]).toBe("Bearer test-key");
    expect(JSON.parse(request.body).subject).toBe("Test");
  });

  it("returns bounce on a 4xx response (do-not-retry per PRD §21.3)", async () => {
    server.setHandler(() => ({
      status: 422,
      body: { message: "invalid recipient" },
    }));

    const result = await client.send({
      from: "noreply@inteloop.com",
      to: "bad",
      subject: "Test",
      html: "<p>hi</p>",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("bounce");
      expect(result.status).toBe(422);
      expect(result.error).toBe("invalid recipient");
    }
  });

  it("returns rate_limited on a 429 response", async () => {
    server.setHandler(() => ({ status: 429, body: "throttled" }));
    const result = await client.send({
      from: "x",
      to: "y@x.com",
      subject: "",
      html: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("rate_limited");
  });

  it("returns outage on a 5xx response (retry-eligible per PRD §21.3)", async () => {
    server.setHandler(() => ({ status: 503, body: "down" }));
    const result = await client.send({
      from: "x",
      to: "y@x.com",
      subject: "",
      html: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("outage");
  });

  it("returns timeout when the server delays past timeoutMs", async () => {
    server.setHandler(() => ({ status: 200, body: { id: "x" }, delayMs: 500 }));
    const result = await client.send({
      from: "x",
      to: "y@x.com",
      subject: "",
      html: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");
  });

  it("returns unknown when the 2xx body is missing an id", async () => {
    server.setHandler(() => ({ status: 200, body: {} }));
    const result = await client.send({
      from: "x",
      to: "y@x.com",
      subject: "",
      html: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unknown");
  });
});
