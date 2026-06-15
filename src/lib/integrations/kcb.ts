import "server-only";

// ⚠️ UNVERIFIED INTEGRATION — Lipa na KCB (KCB Open Banking API).
//
// docs/inteloop-prd.md §10.7 explicitly warns:
//   "KCB Open Banking API documentation changes periodically. Verify the
//    current endpoint specification directly with KCB's developer support
//    before implementation. Do not implement based on third-party
//    documentation alone."
//
// This adapter is therefore written against a *best-effort, documented-shape*
// spec and MUST be validated against KCB's sandbox before going live. The
// request/response field names and the auth scheme below are placeholders that
// likely need adjustment once KCB confirms the contract. The structure (token
// → initiate → async callback) and the result-shape convention match the rest
// of the codebase so the surrounding billing logic is stable regardless.

const SANDBOX_BASE_URL = "https://uat.buni.kcbgroup.com";
const PRODUCTION_BASE_URL = "https://api.buni.kcbgroup.com";
const DEFAULT_TIMEOUT_MS = 30_000;

export type KcbEnv = "sandbox" | "production";

export type KcbConfig = {
  apiKey: string;
  merchantCode: string;
  env: KcbEnv;
  baseUrl?: string; // override for tests
  timeoutMs?: number;
};

export type KcbInitiateInput = {
  amount: number; // whole KES
  accountReference: string;
  callbackUrl: string;
  description: string;
  phone?: string;
};

export type KcbInitiateSuccess = {
  ok: true;
  // KCB's correlation id for the initiated payment; the callback echoes it.
  transactionReference: string;
};

export type KcbFailure = {
  ok: false;
  reason: "auth" | "rejected" | "rate_limited" | "outage" | "timeout" | "unknown";
  status?: number;
  error?: string;
};

export type KcbInitiateResult = KcbInitiateSuccess | KcbFailure;

export type KcbClient = {
  initiatePayment(input: KcbInitiateInput): Promise<KcbInitiateResult>;
};

export function createKcbClient(config: KcbConfig): KcbClient {
  const baseUrl = (
    config.baseUrl ?? (config.env === "production" ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL)
  ).replace(/\/$/, "");
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function initiatePayment(input: KcbInitiateInput): Promise<KcbInitiateResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // NOTE: endpoint path, auth header, and body shape are UNVERIFIED.
      const res = await fetch(`${baseUrl}/payments/initiate`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          merchantCode: config.merchantCode,
          amount: Math.round(input.amount),
          currency: "KES",
          accountReference: input.accountReference,
          callbackUrl: input.callbackUrl,
          description: input.description,
          ...(input.phone ? { phoneNumber: input.phone } : {}),
        }),
      });

      if (res.status === 401 || res.status === 403) {
        return { ok: false, reason: "auth", status: res.status };
      }
      if (res.status === 429) return { ok: false, reason: "rate_limited", status: 429 };
      if (res.status >= 500) return { ok: false, reason: "outage", status: res.status };

      const body = (await res.json().catch(() => null)) as {
        transactionReference?: string;
        reference?: string;
        message?: string;
      } | null;

      if (!res.ok || !body) {
        return {
          ok: false,
          reason: "rejected",
          status: res.status,
          ...(body?.message ? { error: body.message } : {}),
        };
      }
      const reference = body.transactionReference ?? body.reference;
      if (!reference) {
        return { ok: false, reason: "rejected", status: res.status, error: "missing reference" };
      }
      return { ok: true, transactionReference: reference };
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

  return { initiatePayment };
}
