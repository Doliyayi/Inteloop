import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createResendDomainsClient,
  type ResendDomainsClient,
} from "@/lib/integrations/resendDomains";
import { startMockServer, type MockServer } from "../_helpers/mockServer";

describe("Resend domains adapter (PRD §13.3)", () => {
  let server: MockServer;
  let client: ResendDomainsClient;

  beforeEach(async () => {
    server = await startMockServer();
    client = createResendDomainsClient({ apiKey: "test", baseUrl: server.url, timeoutMs: 300 });
  });
  afterEach(async () => {
    await server.close();
  });

  it("createDomain returns id, status, and normalised DNS records", async () => {
    server.setHandler(() => ({
      status: 201,
      body: {
        id: "dom_1",
        name: "reports.agency.com",
        status: "not_started",
        records: [
          { record: "SPF", type: "TXT", name: "send", value: "v=spf1 include:amazonses.com ~all" },
          {
            record: "DKIM",
            type: "CNAME",
            name: "resend._domainkey",
            value: "x.dkim.amazonses.com",
          },
        ],
      },
    }));

    const r = await client.createDomain("reports.agency.com");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.id).toBe("dom_1");
      expect(r.status).toBe("not_started");
      expect(r.records).toHaveLength(2);
      expect(r.records[0]!.type).toBe("TXT");
    }
    const sent = server.requests[0]!;
    expect(sent.method).toBe("POST");
    expect(sent.url).toBe("/domains");
    expect(JSON.parse(sent.body).name).toBe("reports.agency.com");
  });

  it("getDomain reports verified status", async () => {
    server.setHandler(() => ({
      status: 200,
      body: { id: "dom_1", name: "x.com", status: "verified", records: [] },
    }));
    const r = await client.getDomain("dom_1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("verified");
  });

  it("verifyDomain hits the verify endpoint", async () => {
    server.setHandler(() => ({
      status: 200,
      body: { id: "dom_1", name: "x.com", status: "pending", records: [] },
    }));
    await client.verifyDomain("dom_1");
    expect(server.requests[0]!.url).toBe("/domains/dom_1/verify");
  });

  it("maps 4xx to rejected and 5xx to outage", async () => {
    server.setHandler(() => ({ status: 422, body: { message: "invalid domain" } }));
    const bad = await client.createDomain("nope");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("rejected");

    server.setHandler(() => ({ status: 500, body: "boom" }));
    const down = await client.getDomain("dom_1");
    expect(down.ok).toBe(false);
    if (!down.ok) expect(down.reason).toBe("outage");
  });
});
