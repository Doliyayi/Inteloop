import "server-only";

const DEFAULT_BASE_URL = "https://api.resend.com";
const DEFAULT_TIMEOUT_MS = 15_000;

export type ResendConfig = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export type SendEmailInput = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  reply_to?: string;
  text?: string;
};

export type SendEmailSuccess = {
  ok: true;
  id: string;
};

export type SendEmailFailure = {
  ok: false;
  // Maps PRD §21.3:
  //   Resend 4xx (bad address)         → 'bounce'
  //   Resend 429 (rate limit)          → 'rate_limited'
  //   Resend 5xx (outage)              → 'outage'
  //   Network/abort                    → 'timeout'
  //   Any other parse / unknown error  → 'unknown'
  reason: "bounce" | "rate_limited" | "outage" | "timeout" | "unknown";
  status?: number;
  error?: string;
};

export type SendEmailResult = SendEmailSuccess | SendEmailFailure;

export type ResendClient = {
  send(input: SendEmailInput): Promise<SendEmailResult>;
};

export function createResendClient(config: ResendConfig): ResendClient {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function send(input: SendEmailInput): Promise<SendEmailResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/emails`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(input),
      });

      if (res.status === 429) {
        return { ok: false, reason: "rate_limited", status: 429 };
      }
      if (res.status >= 500) {
        return { ok: false, reason: "outage", status: res.status };
      }
      if (res.status >= 400) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        return {
          ok: false,
          reason: "bounce",
          status: res.status,
          ...(body?.message ? { error: body.message } : {}),
        };
      }

      const body = (await res.json().catch(() => null)) as { id?: string } | null;
      if (!body?.id) {
        return { ok: false, reason: "unknown", status: res.status, error: "missing id" };
      }
      return { ok: true, id: body.id };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, reason: "timeout" };
      }
      return {
        ok: false,
        reason: "unknown",
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { send };
}

let defaultClient: ResendClient | null = null;
export function resend(): ResendClient {
  if (!defaultClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
    defaultClient = createResendClient({ apiKey });
  }
  return defaultClient;
}
