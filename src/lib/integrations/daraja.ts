import "server-only";

// Safaricom Daraja API v2 adapter — Lipa na Mpesa STK Push (M-Pesa Express).
// Source: docs/inteloop-prd.md §10.6. Mirrors the result-shape convention of
// the other adapters (resend/brave/firecrawl): never throws, returns a
// discriminated result the workflow can branch on.

const SANDBOX_BASE_URL = "https://sandbox.safaricom.co.ke";
const PRODUCTION_BASE_URL = "https://api.safaricom.co.ke";
const DEFAULT_TIMEOUT_MS = 30_000;
// Refresh the OAuth token slightly before Daraja's stated expiry (~3600s).
const TOKEN_EXPIRY_SKEW_MS = 60_000;

export type DarajaEnv = "sandbox" | "production";

export type DarajaConfig = {
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  env: DarajaEnv;
  baseUrl?: string; // override for tests
  timeoutMs?: number;
};

export type StkPushInput = {
  amount: number; // whole KES
  phone: string; // any local format; normalised to 2547XXXXXXXX
  accountReference: string; // max 12 chars on Daraja
  transactionDesc: string;
  callbackUrl: string;
};

export type StkPushSuccess = {
  ok: true;
  merchantRequestId: string;
  checkoutRequestId: string;
  customerMessage: string;
};

export type DarajaFailure = {
  ok: false;
  // 'auth'        → OAuth token request failed
  // 'rejected'    → Daraja accepted the request but returned a non-zero code
  // 'rate_limited'→ 429
  // 'outage'      → 5xx
  // 'timeout'     → network abort
  // 'unknown'     → anything else
  reason: "auth" | "rejected" | "rate_limited" | "outage" | "timeout" | "unknown";
  status?: number;
  error?: string;
};

export type StkPushResult = StkPushSuccess | DarajaFailure;

export type DarajaClient = {
  stkPush(input: StkPushInput): Promise<StkPushResult>;
};

// Daraja requires the MSISDN as 2547XXXXXXXX / 2541XXXXXXXX (no +, no leading 0).
export function normalizeMsisdn(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.startsWith("7") || digits.startsWith("1")) return `254${digits}`;
  return digits;
}

// YYYYMMDDHHmmss in the account's local time. Daraja pairs this with the
// password hash; both must use the same timestamp.
function darajaTimestamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}` +
    `${p(now.getMonth() + 1)}` +
    `${p(now.getDate())}` +
    `${p(now.getHours())}` +
    `${p(now.getMinutes())}` +
    `${p(now.getSeconds())}`
  );
}

export function createDarajaClient(config: DarajaConfig): DarajaClient {
  const baseUrl = (
    config.baseUrl ?? (config.env === "production" ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL)
  ).replace(/\/$/, "");
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let cachedToken: { value: string; expiresAt: number } | null = null;

  async function fetchWithTimeout(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function getToken(): Promise<{ ok: true; token: string } | DarajaFailure> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
      return { ok: true, token: cachedToken.value };
    }
    const basic = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
    try {
      const res = await fetchWithTimeout("/oauth/v1/generate?grant_type=client_credentials", {
        method: "GET",
        headers: { Authorization: `Basic ${basic}` },
      });
      if (!res.ok) {
        return { ok: false, reason: "auth", status: res.status };
      }
      const body = (await res.json().catch(() => null)) as {
        access_token?: string;
        expires_in?: string | number;
      } | null;
      if (!body?.access_token) {
        return { ok: false, reason: "auth", error: "missing access_token" };
      }
      const expiresInMs = (Number(body.expires_in) || 3600) * 1000;
      cachedToken = {
        value: body.access_token,
        expiresAt: Date.now() + expiresInMs - TOKEN_EXPIRY_SKEW_MS,
      };
      return { ok: true, token: body.access_token };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError")
        return { ok: false, reason: "timeout" };
      return {
        ok: false,
        reason: "unknown",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function stkPush(input: StkPushInput): Promise<StkPushResult> {
    const auth = await getToken();
    if (!auth.ok) return auth;

    const timestamp = darajaTimestamp(new Date());
    const password = Buffer.from(`${config.shortCode}${config.passkey}${timestamp}`).toString(
      "base64",
    );
    const msisdn = normalizeMsisdn(input.phone);

    try {
      const res = await fetchWithTimeout("/mpesa/stkpush/v1/processrequest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          BusinessShortCode: config.shortCode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: Math.round(input.amount),
          PartyA: msisdn,
          PartyB: config.shortCode,
          PhoneNumber: msisdn,
          CallBackURL: input.callbackUrl,
          AccountReference: input.accountReference.slice(0, 12),
          TransactionDesc: input.transactionDesc,
        }),
      });

      if (res.status === 429) return { ok: false, reason: "rate_limited", status: 429 };
      if (res.status >= 500) return { ok: false, reason: "outage", status: res.status };

      const body = (await res.json().catch(() => null)) as {
        MerchantRequestID?: string;
        CheckoutRequestID?: string;
        ResponseCode?: string;
        ResponseDescription?: string;
        CustomerMessage?: string;
        errorMessage?: string;
      } | null;

      if (!res.ok || !body) {
        return {
          ok: false,
          reason: "rejected",
          status: res.status,
          ...(body?.errorMessage ? { error: body.errorMessage } : {}),
        };
      }
      // ResponseCode "0" = the push was accepted and sent to the handset.
      if (body.ResponseCode !== "0" || !body.CheckoutRequestID || !body.MerchantRequestID) {
        return {
          ok: false,
          reason: "rejected",
          status: res.status,
          error: body.ResponseDescription ?? body.errorMessage ?? "non-zero ResponseCode",
        };
      }
      return {
        ok: true,
        merchantRequestId: body.MerchantRequestID,
        checkoutRequestId: body.CheckoutRequestID,
        customerMessage: body.CustomerMessage ?? "",
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError")
        return { ok: false, reason: "timeout" };
      return {
        ok: false,
        reason: "unknown",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { stkPush };
}
