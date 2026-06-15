import "server-only";

// Slack Incoming Webhooks adapter — no OAuth (PRD §12.2). The user pastes a
// webhook URL; we POST a JSON message to it. Mirrors the result-shape
// convention of the other adapters (never throws).

const DEFAULT_TIMEOUT_MS = 10_000;

export type SlackMessage = {
  text: string;
};

export type SlackResult =
  | { ok: true }
  | {
      // 'invalid_url'  → not a hooks.slack.com URL (rejected before sending)
      // 'rejected'     → Slack returned non-2xx (e.g. revoked/404 webhook)
      // 'timeout'      → network abort
      // 'unknown'      → anything else
      ok: false;
      reason: "invalid_url" | "rejected" | "timeout" | "unknown";
      status?: number;
      error?: string;
    };

export type SlackNotifier = {
  send(webhookUrl: string, message: SlackMessage): Promise<SlackResult>;
};

// §12.3: reject any non-Slack domain at save time. Slack incoming webhooks are
// always https://hooks.slack.com/services/...
export function isValidSlackWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname === "hooks.slack.com" &&
    url.pathname.startsWith("/services/")
  );
}

export type SlackNotifierConfig = {
  timeoutMs?: number;
  // URL guard, overridable in tests so the HTTP path can target a mock server.
  // Defaults to the strict hooks.slack.com check (SSRF guard).
  validateUrl?: (url: string) => boolean;
};

export function createSlackNotifier(config: SlackNotifierConfig = {}): SlackNotifier {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const validateUrl = config.validateUrl ?? isValidSlackWebhookUrl;

  async function send(webhookUrl: string, message: SlackMessage): Promise<SlackResult> {
    if (!validateUrl(webhookUrl)) {
      return { ok: false, reason: "invalid_url" };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          reason: "rejected",
          status: res.status,
          ...(body ? { error: body } : {}),
        };
      }
      return { ok: true };
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

  return { send };
}

// §12.2 message format for a major competitive change.
export function formatMajorChangeAlert(opts: { summary: string; reportUrl: string }): SlackMessage {
  return {
    text: [
      "🔔 *Inteloop Alert — Major competitive change detected*",
      opts.summary,
      `<${opts.reportUrl}|View the full report in Inteloop>`,
    ].join("\n"),
  };
}

let defaultNotifier: SlackNotifier | null = null;
export function slack(): SlackNotifier {
  if (!defaultNotifier) defaultNotifier = createSlackNotifier();
  return defaultNotifier;
}
