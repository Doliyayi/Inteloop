import "server-only";

// Resend domain management — register a sender domain, fetch its DNS records +
// verification status, and trigger verification (PRD §13.3). Mirrors the
// result-shape convention of the send adapter (never throws).

const DEFAULT_BASE_URL = "https://api.resend.com";
const DEFAULT_TIMEOUT_MS = 15_000;

export type DnsRecord = {
  record: string; // e.g. "SPF", "DKIM"
  type: string; // "TXT" | "MX" | "CNAME"
  name: string;
  value: string;
  ttl?: string;
  priority?: number;
  status?: string;
};

// Resend domain verification states.
export type DomainStatus = "not_started" | "pending" | "verified" | "failed" | "temporary_failure";

export type DomainSuccess = {
  ok: true;
  id: string;
  name: string;
  status: DomainStatus;
  records: DnsRecord[];
};

export type DomainFailure = {
  ok: false;
  reason: "rate_limited" | "outage" | "rejected" | "timeout" | "unknown";
  status?: number;
  error?: string;
};

export type DomainResult = DomainSuccess | DomainFailure;

export type ResendDomainsConfig = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export type ResendDomainsClient = {
  createDomain(name: string): Promise<DomainResult>;
  getDomain(id: string): Promise<DomainResult>;
  verifyDomain(id: string): Promise<DomainResult>;
};

type RawDomain = {
  id?: string;
  name?: string;
  status?: string;
  records?: Array<{
    record?: string;
    type?: string;
    name?: string;
    value?: string;
    ttl?: string;
    priority?: number;
    status?: string;
  }>;
};

function normalize(body: RawDomain | null, fallbackId: string): DomainSuccess {
  return {
    ok: true,
    id: body?.id ?? fallbackId,
    name: body?.name ?? "",
    status: (body?.status as DomainStatus) ?? "not_started",
    records: (body?.records ?? []).map((r) => ({
      record: r.record ?? "",
      type: r.type ?? "TXT",
      name: r.name ?? "",
      value: r.value ?? "",
      ...(r.ttl ? { ttl: r.ttl } : {}),
      ...(r.priority !== undefined ? { priority: r.priority } : {}),
      ...(r.status ? { status: r.status } : {}),
    })),
  };
}

export function createResendDomainsClient(config: ResendDomainsConfig): ResendDomainsClient {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call(
    path: string,
    method: "GET" | "POST",
    fallbackId: string,
    body?: unknown,
  ): Promise<DomainResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (res.status === 429) return { ok: false, reason: "rate_limited", status: 429 };
      if (res.status >= 500) return { ok: false, reason: "outage", status: res.status };

      const json = (await res.json().catch(() => null)) as
        | (RawDomain & { message?: string })
        | null;
      if (res.status >= 400) {
        return {
          ok: false,
          reason: "rejected",
          status: res.status,
          ...(json?.message ? { error: json.message } : {}),
        };
      }
      return normalize(json, fallbackId);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError")
        return { ok: false, reason: "timeout" };
      return {
        ok: false,
        reason: "unknown",
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    createDomain: (name) => call("/domains", "POST", "", { name }),
    getDomain: (id) => call(`/domains/${id}`, "GET", id),
    verifyDomain: (id) => call(`/domains/${id}/verify`, "POST", id),
  };
}
