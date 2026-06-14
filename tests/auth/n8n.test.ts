import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { notifyN8nUserConfirmed } from "@/lib/integrations/n8n";

type CapturedRequest = {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
  body: string;
};

type MockServer = {
  port: number;
  requests: CapturedRequest[];
  close: () => Promise<void>;
};

async function startMockServer(): Promise<MockServer> {
  const requests: CapturedRequest[] = [];
  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    requests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      body: Buffer.concat(chunks).toString("utf-8"),
    });
    res.statusCode = 200;
    res.end("ok");
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    port,
    requests,
    close: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

describe("notifyN8nUserConfirmed", () => {
  let server: MockServer;
  const originalUrl = process.env.N8N_WELCOME_REPORT_WEBHOOK_URL;
  const originalSecret = process.env.N8N_WEBHOOK_SECRET;

  beforeEach(async () => {
    server = await startMockServer();
    process.env.N8N_WELCOME_REPORT_WEBHOOK_URL = `http://127.0.0.1:${server.port}`;
    process.env.N8N_WEBHOOK_SECRET = "test-secret";
  });

  afterEach(async () => {
    await server.close();
    if (originalUrl === undefined) delete process.env.N8N_WELCOME_REPORT_WEBHOOK_URL;
    else process.env.N8N_WELCOME_REPORT_WEBHOOK_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.N8N_WEBHOOK_SECRET;
    else process.env.N8N_WEBHOOK_SECRET = originalSecret;
  });

  it("POSTs the PRD §8.3 payload with bearer auth", async () => {
    await notifyN8nUserConfirmed({
      type: "INSERT",
      table: "profiles",
      record: {
        id: "user-1",
        email: "user@example.com",
        created_at: "2026-06-14T00:00:00Z",
      },
    });

    expect(server.requests).toHaveLength(1);
    const request = server.requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.authorization).toBe("Bearer test-secret");
    const body = JSON.parse(request.body);
    expect(body).toEqual({
      type: "INSERT",
      table: "profiles",
      record: {
        id: "user-1",
        email: "user@example.com",
        created_at: "2026-06-14T00:00:00Z",
      },
    });
  });

  it("swallows network errors without throwing", async () => {
    process.env.N8N_WELCOME_REPORT_WEBHOOK_URL = "http://127.0.0.1:1";
    await expect(
      notifyN8nUserConfirmed({
        type: "INSERT",
        table: "profiles",
        record: { id: "x", email: "x@x.com", created_at: "2026-06-14T00:00:00Z" },
      }),
    ).resolves.toBeUndefined();
    expect(server.requests).toHaveLength(0);
  });

  it("no-ops when env vars are missing", async () => {
    delete process.env.N8N_WELCOME_REPORT_WEBHOOK_URL;
    await notifyN8nUserConfirmed({
      type: "INSERT",
      table: "profiles",
      record: { id: "x", email: "x@x.com", created_at: "2026-06-14T00:00:00Z" },
    });
    expect(server.requests).toHaveLength(0);
  });
});
