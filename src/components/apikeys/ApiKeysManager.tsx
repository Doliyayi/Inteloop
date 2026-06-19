"use client";

import { useState } from "react";

type ApiKey = {
  id: string;
  key_prefix: string;
  label: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ApiKeysManager({ initial }: { initial: ApiKey[] }) {
  const [keys, setKeys] = useState<ApiKey[]>(initial);
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The freshly-created plaintext key, shown exactly once (§15.4).
  const [revealed, setRevealed] = useState<string | null>(null);

  const activeCount = keys.filter((k) => !k.revoked_at).length;

  async function create() {
    setError(null);
    setRevealed(null);
    setPending(true);
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { key: ApiKey; plaintext: string };
      error?: string;
    };
    setPending(false);
    if (!res.ok || !data.data) {
      setError(data.error ?? "Could not create the key.");
      return;
    }
    setKeys((prev) => [data.data!.key, ...prev]);
    setRevealed(data.data.plaintext);
    setLabel("");
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this API key? Apps using it will stop working immediately."))
      return;
    const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    if (res.ok) {
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k)),
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-neutral-950">Create an API key</h2>
          <p className="text-sm text-neutral-500">
            Up to 5 active keys. The key is shown once — store it somewhere safe.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="key_label" className="field-label">
              Label (optional)
            </label>
            <input
              id="key_label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Production server"
              className="field-input"
            />
          </div>
          <button
            type="button"
            onClick={create}
            disabled={pending || activeCount >= 5}
            className="btn-primary"
          >
            {pending ? "Creating…" : "Create key"}
          </button>
        </div>
        {activeCount >= 5 ? (
          <p className="text-sm text-neutral-500">
            You&apos;ve reached the 5-key limit. Revoke one to create another.
          </p>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        {revealed ? (
          <div className="alert-success space-y-2">
            <p className="font-medium">Copy your new key now — you won&apos;t see it again:</p>
            <code className="block break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-neutral-900">
              {revealed}
            </code>
          </div>
        ) : null}
      </div>

      {keys.length > 0 ? (
        <div className="card">
          <h2 className="text-base font-semibold text-neutral-950">Your keys</h2>
          <ul className="mt-3 divide-y divide-neutral-100">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-neutral-900">
                    {k.key_prefix}…
                    {k.label ? (
                      <span className="ml-2 font-sans text-neutral-500">{k.label}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Created {formatDate(k.created_at)} · Last used {formatDate(k.last_used_at)}
                  </p>
                </div>
                {k.revoked_at ? (
                  <span className="text-xs font-medium text-neutral-400">Revoked</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => revoke(k.id)}
                    className="text-sm font-medium text-rose-600 transition hover:text-rose-500"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
