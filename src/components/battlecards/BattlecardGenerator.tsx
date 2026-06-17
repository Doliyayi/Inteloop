"use client";

import { useState } from "react";

type Competitor = { id: string; name: string };

export function BattlecardGenerator({ competitors }: { competitors: Competitor[] }) {
  const [competitorId, setCompetitorId] = useState(competitors[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (competitors.length === 0) {
    return (
      <div className="card text-sm text-neutral-600">
        Add a competitor first, then generate a battlecard for it.
      </div>
    );
  }

  async function generate() {
    setError(null);
    setPending(true);
    const res = await fetch("/api/battlecards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitor_id: competitorId }),
    });
    const data = (await res.json().catch(() => ({}))) as { data?: { id: string }; error?: string };
    if (res.ok && data.data?.id) {
      window.location.href = `/dashboard/battlecards/${data.data.id}`;
      return;
    }
    setError(data.error ?? "Could not generate the battlecard.");
    setPending(false);
  }

  return (
    <div className="card space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-neutral-950">Generate a battlecard</h2>
        <p className="text-sm text-neutral-500">
          A sales-ready competitive brief for any tracked competitor.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <label htmlFor="bc_competitor" className="field-label">
            Competitor
          </label>
          <select
            id="bc_competitor"
            value={competitorId}
            onChange={(e) => setCompetitorId(e.target.value)}
            className="field-input"
          >
            {competitors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={generate} disabled={pending} className="btn-primary">
          {pending ? "Generating…" : "Generate"}
        </button>
      </div>
      {pending ? (
        <p className="text-sm text-neutral-500">
          Gathering fresh data and writing the battlecard — this can take up to a minute.
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
