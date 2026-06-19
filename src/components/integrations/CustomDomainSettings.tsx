"use client";

import { useEffect, useState } from "react";

type DnsRecord = { record: string; type: string; name: string; value: string };
type DomainData = { domain: string; status: string; verified: boolean; records: DnsRecord[] };

type Props = { initialDomain: string | null; initialVerified: boolean };

export function CustomDomainSettings({ initialDomain, initialVerified }: Props) {
  const [domain, setDomain] = useState(initialDomain ?? "");
  const [registered, setRegistered] = useState<DomainData | null>(
    initialDomain
      ? {
          domain: initialDomain,
          status: initialVerified ? "verified" : "pending",
          verified: initialVerified,
          records: [],
        }
      : null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load current records + status if a domain is already registered.
  useEffect(() => {
    if (!initialDomain) return;
    fetch("/api/whitelabel/dns-records")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.data && setRegistered(j.data as DomainData))
      .catch(() => {});
  }, [initialDomain]);

  async function call(url: string, method: string, action: string, body?: unknown) {
    setError(null);
    setBusy(action);
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await res.json().catch(() => ({}))) as { data?: DomainData; error?: string };
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return null;
    }
    return data.data ?? null;
  }

  async function register() {
    const data = await call("/api/whitelabel/domain", "POST", "register", {
      domain: domain.trim(),
    });
    if (data) setRegistered(data);
  }
  async function verify() {
    const data = await call("/api/whitelabel/domain/verify", "POST", "verify");
    if (data) setRegistered(data);
  }
  async function remove() {
    setError(null);
    setBusy("remove");
    await fetch("/api/whitelabel/domain", { method: "DELETE" });
    setBusy(null);
    setRegistered(null);
    setDomain("");
  }

  return (
    <div className="card space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-neutral-950">Custom sender domain</h2>
        <p className="text-sm text-neutral-500">
          Send reports from your own domain so no Inteloop branding appears in the email headers.
          Add the DNS records below, then verify.
        </p>
      </div>

      {!registered ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="wl_domain" className="field-label">
              Sender domain
            </label>
            <input
              id="wl_domain"
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="reports.youragency.com"
              className="field-input"
            />
          </div>
          <button
            type="button"
            onClick={register}
            disabled={busy === "register"}
            className="btn-primary"
          >
            {busy === "register" ? "Registering…" : "Get DNS records"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-neutral-900">{registered.domain}</span>
            {registered.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                ✓ Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                Pending verification
              </span>
            )}
          </div>

          {registered.records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-neutral-500">
                  <tr>
                    <th className="py-1 pr-3">Type</th>
                    <th className="py-1 pr-3">Name</th>
                    <th className="py-1">Value</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-neutral-800">
                  {registered.records.map((r, i) => (
                    <tr key={i} className="border-t border-neutral-100 align-top">
                      <td className="py-1.5 pr-3">{r.type}</td>
                      <td className="break-all py-1.5 pr-3">{r.name}</td>
                      <td className="break-all py-1.5">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">DNS records will appear here once loaded.</p>
          )}

          <div className="flex flex-wrap gap-3">
            {!registered.verified ? (
              <button
                type="button"
                onClick={verify}
                disabled={busy === "verify"}
                className="btn-primary"
              >
                {busy === "verify" ? "Checking…" : "Check verification"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={remove}
              disabled={busy === "remove"}
              className="btn-danger"
            >
              Remove domain
            </button>
          </div>
        </div>
      )}

      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
