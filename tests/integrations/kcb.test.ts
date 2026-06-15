import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createKcbClient, type KcbClient } from "@/lib/integrations/kcb";
import { startMockServer, type MockServer } from "../_helpers/mockServer";

const INPUT = {
  amount: 51_400,
  accountReference: "INT-growth",
  callbackUrl: "https://app.inteloop.com/api/webhooks/kcb?token=x",
  description: "Inteloop Growth subscription",
};

// The KCB adapter is UNVERIFIED (see src/lib/integrations/kcb.ts). These tests
// pin the result-shape contract the billing logic relies on, not the (still
// unconfirmed) wire format.
describe("KCB adapter (unverified — PRD §10.7)", () => {
  let server: MockServer;
  let client: KcbClient;

  beforeEach(async () => {
    server = await startMockServer();
    client = createKcbClient({
      apiKey: "key",
      merchantCode: "MC1",
      env: "sandbox",
      baseUrl: server.url,
      timeoutMs: 300,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns the transaction reference on success", async () => {
    server.setHandler(() => ({ status: 200, body: { transactionReference: "KCB-1" } }));
    const result = await client.initiatePayment(INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transactionReference).toBe("KCB-1");

    const sent = server.requests[0]!;
    expect(sent.headers["authorization"]).toBe("Bearer key");
    expect(JSON.parse(sent.body).merchantCode).toBe("MC1");
  });

  it("maps 401/403 to 'auth'", async () => {
    server.setHandler(() => ({ status: 401, body: { message: "unauthorized" } }));
    const result = await client.initiatePayment(INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("auth");
  });

  it("maps 5xx to 'outage'", async () => {
    server.setHandler(() => ({ status: 500, body: "boom" }));
    const result = await client.initiatePayment(INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("outage");
  });

  it("treats a missing reference as 'rejected'", async () => {
    server.setHandler(() => ({ status: 200, body: { message: "ok but no ref" } }));
    const result = await client.initiatePayment(INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("rejected");
  });
});
