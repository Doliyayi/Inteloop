import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDarajaClient, normalizeMsisdn, type DarajaClient } from "@/lib/integrations/daraja";
import { startMockServer, type MockServer } from "../_helpers/mockServer";

const STK_INPUT = {
  amount: 25_500,
  phone: "0712345678",
  accountReference: "INT-starter",
  transactionDesc: "Inteloop Starter subscription",
  callbackUrl: "https://app.inteloop.com/api/webhooks/mpesa?token=x",
};

describe("normalizeMsisdn", () => {
  it("converts local formats to 2547XXXXXXXX", () => {
    expect(normalizeMsisdn("0712345678")).toBe("254712345678");
    expect(normalizeMsisdn("+254712345678")).toBe("254712345678");
    expect(normalizeMsisdn("254712345678")).toBe("254712345678");
    expect(normalizeMsisdn("712345678")).toBe("254712345678");
  });
});

describe("Daraja adapter (PRD §10.6)", () => {
  let server: MockServer;
  let client: DarajaClient;

  beforeEach(async () => {
    server = await startMockServer();
    client = createDarajaClient({
      consumerKey: "ck",
      consumerSecret: "cs",
      shortCode: "174379",
      passkey: "pk",
      env: "sandbox",
      baseUrl: server.url,
      timeoutMs: 300,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it("fetches a token then returns checkout ids on an accepted push", async () => {
    server.setHandler((request) => {
      if (request.url?.startsWith("/oauth")) {
        return { status: 200, body: { access_token: "tok-123", expires_in: "3599" } };
      }
      return {
        status: 200,
        body: {
          MerchantRequestID: "mr-1",
          CheckoutRequestID: "co-1",
          ResponseCode: "0",
          ResponseDescription: "Success. Request accepted for processing",
          CustomerMessage: "Success. Request accepted for processing",
        },
      };
    });

    const result = await client.stkPush(STK_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.checkoutRequestId).toBe("co-1");
      expect(result.merchantRequestId).toBe("mr-1");
    }

    // OAuth used Basic auth; STK push used the bearer token and normalised phone.
    const oauth = server.requests.find((r) => r.url?.startsWith("/oauth"))!;
    expect(oauth.headers["authorization"]).toBe(`Basic ${Buffer.from("ck:cs").toString("base64")}`);
    const push = server.requests.find((r) => r.url?.includes("stkpush"))!;
    expect(push.headers["authorization"]).toBe("Bearer tok-123");
    const pushBody = JSON.parse(push.body);
    expect(pushBody.PhoneNumber).toBe("254712345678");
    expect(pushBody.Amount).toBe(25_500);
  });

  it("maps an auth failure when the token request fails", async () => {
    server.setHandler((request) =>
      request.url?.startsWith("/oauth")
        ? { status: 400, body: { error: "invalid_client" } }
        : { status: 200, body: {} },
    );
    const result = await client.stkPush(STK_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("auth");
  });

  it("maps a non-zero ResponseCode to 'rejected'", async () => {
    server.setHandler((request) =>
      request.url?.startsWith("/oauth")
        ? { status: 200, body: { access_token: "tok", expires_in: "3599" } }
        : { status: 200, body: { ResponseCode: "1", errorMessage: "Invalid Amount" } },
    );
    const result = await client.stkPush(STK_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("rejected");
  });

  it("maps a 5xx push response to 'outage'", async () => {
    server.setHandler((request) =>
      request.url?.startsWith("/oauth")
        ? { status: 200, body: { access_token: "tok", expires_in: "3599" } }
        : { status: 503, body: "down" },
    );
    const result = await client.stkPush(STK_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("outage");
      expect(result.status).toBe(503);
    }
  });

  it("caches the OAuth token across pushes", async () => {
    server.setHandler((request) =>
      request.url?.startsWith("/oauth")
        ? { status: 200, body: { access_token: "tok", expires_in: "3599" } }
        : {
            status: 200,
            body: { MerchantRequestID: "m", CheckoutRequestID: "c", ResponseCode: "0" },
          },
    );
    await client.stkPush(STK_INPUT);
    await client.stkPush(STK_INPUT);
    const oauthCalls = server.requests.filter((r) => r.url?.startsWith("/oauth"));
    expect(oauthCalls).toHaveLength(1);
  });
});
