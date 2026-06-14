import "server-only";

export type N8nUserConfirmedPayload = {
  type: "INSERT";
  table: "profiles";
  record: {
    id: string;
    email: string;
    created_at: string;
  };
};

// Fires the welcome-report webhook to n8n after a user confirms their email.
// Failures are logged and swallowed — a transient n8n outage must not break
// the confirmation flow. M5 introduces report_errors-backed retry.
export async function notifyN8nUserConfirmed(payload: N8nUserConfirmedPayload): Promise<void> {
  const url = process.env.N8N_WELCOME_REPORT_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!url || !secret) {
    console.warn(
      "[n8n] N8N_WELCOME_REPORT_WEBHOOK_URL or N8N_WEBHOOK_SECRET missing; webhook skipped.",
    );
    return;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[n8n] welcome webhook returned ${res.status} for user ${payload.record.id}`);
    }
  } catch (err) {
    console.error("[n8n] welcome webhook failed:", err);
  }
}
