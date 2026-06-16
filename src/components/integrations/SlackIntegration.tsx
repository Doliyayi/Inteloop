"use client";

import { useState } from "react";

type Props = { savedUrl: string };

type Notice = { kind: "success" | "error"; text: string } | null;

export function SlackIntegration({ savedUrl }: Props) {
  const [url, setUrl] = useState(savedUrl);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function save() {
    setNotice(null);
    setSaving(true);
    const res = await fetch("/api/integrations/slack", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhook_url: url.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      data?: { connected: boolean };
    };
    setSaving(false);
    if (!res.ok) {
      setNotice({ kind: "error", text: data.error ?? "Could not save." });
      return;
    }
    setNotice({
      kind: "success",
      text: data.data?.connected ? "Slack connected." : "Slack disconnected.",
    });
  }

  async function sendTest() {
    setNotice(null);
    setTesting(true);
    const res = await fetch("/api/integrations/slack/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhook_url: url.trim() || undefined }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setTesting(false);
    setNotice(
      res.ok
        ? { kind: "success", text: "Test message sent — check your Slack channel." }
        : { kind: "error", text: data.error ?? "Could not send a test message." },
    );
  }

  return (
    <div className="card space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-neutral-950">Slack alerts</h2>
        <p className="text-sm text-neutral-500">
          Get a Slack message when we detect a major competitive change. Paste an{" "}
          <a
            href="https://api.slack.com/messaging/webhooks"
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            incoming webhook URL
          </a>{" "}
          from your Slack workspace.
        </p>
      </div>

      <div>
        <label htmlFor="slack_webhook" className="field-label">
          Webhook URL
        </label>
        <input
          id="slack_webhook"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/…"
          className="field-input"
        />
      </div>

      {notice ? (
        <p
          className={
            notice.kind === "success" ? "text-sm font-medium text-emerald-700" : "form-error"
          }
        >
          {notice.text}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={sendTest} disabled={testing} className="btn-secondary">
          {testing ? "Sending…" : "Send test message"}
        </button>
      </div>
    </div>
  );
}
