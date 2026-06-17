"use client";

import { useState } from "react";

type Props = {
  initial: {
    enabled: boolean;
    senderName: string;
    logoUrl: string;
    footerText: string;
  };
};

type Notice = { kind: "success" | "error"; text: string } | null;

export function WhiteLabelSettings({ initial }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [senderName, setSenderName] = useState(initial.senderName);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [footerText, setFooterText] = useState(initial.footerText);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function save() {
    setNotice(null);
    setSaving(true);
    const res = await fetch("/api/whitelabel", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        sender_name: senderName.trim(),
        logo_url: logoUrl.trim(),
        footer_text: footerText.trim(),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    setNotice(
      res.ok
        ? { kind: "success", text: "White-label settings saved." }
        : { kind: "error", text: data.error ?? "Could not save." },
    );
  }

  return (
    <div className="card space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-neutral-950">White-label reports</h2>
        <p className="text-sm text-neutral-500">
          Replace Inteloop branding in the reports your clients receive with your own logo, name,
          and footer.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-800">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300 text-rose-600 focus:ring-rose-200"
        />
        Enable white-label branding on reports
      </label>

      <div>
        <label htmlFor="wl_sender" className="field-label">
          Sender name
        </label>
        <input
          id="wl_sender"
          type="text"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          placeholder="Agency Insights"
          className="field-input"
        />
        <p className="field-hint">Shown as the email sender name. 2–50 characters.</p>
      </div>

      <div>
        <label htmlFor="wl_logo" className="field-label">
          Logo URL
        </label>
        <input
          id="wl_logo"
          type="url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://yourdomain.com/logo.png"
          className="field-input"
        />
        <p className="field-hint">A hosted PNG or SVG, shown at the top of each report.</p>
      </div>

      <div>
        <label htmlFor="wl_footer" className="field-label">
          Footer text
        </label>
        <textarea
          id="wl_footer"
          value={footerText}
          onChange={(e) => setFooterText(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Sent by Agency Insights · weekly competitor intelligence"
          className="field-input"
        />
        <p className="field-hint">Replaces the Inteloop footer. Max 200 characters.</p>
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

      <button type="button" onClick={save} disabled={saving} className="btn-primary">
        {saving ? "Saving…" : "Save white-label settings"}
      </button>

      <p className="text-xs text-neutral-400">
        Sending reports from your own domain (custom sender domain + DNS verification) is coming
        soon. For now, reports use your branding from Inteloop&apos;s sending domain.
      </p>
    </div>
  );
}
