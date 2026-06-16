"use client";

import { useState, useTransition } from "react";

import { competitorCreateSchema, competitorUpdateSchema } from "@/lib/competitors/schemas";

export type Competitor = {
  id: string;
  name: string;
  website_url: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Props = {
  initial: Competitor[];
  welcomeReportSent: boolean;
  plan: string;
  limit: number;
};

type FormState = { mode: "closed" } | { mode: "add" } | { mode: "edit"; competitor: Competitor };

export function CompetitorsManager({ initial, welcomeReportSent, plan, limit }: Props) {
  const [competitors, setCompetitors] = useState<Competitor[]>(initial);
  const [form, setForm] = useState<FormState>({ mode: "closed" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const showGeneratingBanner = competitors.length > 0 && !welcomeReportSent;
  const showEmptyBanner = competitors.length === 0;
  // §7.3/§13 tier gating: how many of the plan's allowance is used.
  const atLimit = competitors.length >= limit;
  const canUpgrade = plan === "trial" || plan === "starter" || plan === "growth";

  function clearError() {
    setError(null);
  }

  function handleSubmit(formData: FormData) {
    clearError();
    const input = {
      name: formData.get("name"),
      website_url: formData.get("website_url"),
      notes: formData.get("notes") || null,
    };

    if (form.mode === "add") {
      const parsed = competitorCreateSchema.safeParse(input);
      if (!parsed.success) {
        setError(parsed.error.errors[0]?.message ?? "Invalid input.");
        return;
      }
      startTransition(async () => {
        const res = await fetch("/api/competitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error ?? "Could not add competitor.");
          return;
        }
        setCompetitors((prev) => [body.data as Competitor, ...prev]);
        setForm({ mode: "closed" });
      });
    } else if (form.mode === "edit") {
      const parsed = competitorUpdateSchema.safeParse(input);
      if (!parsed.success) {
        setError(parsed.error.errors[0]?.message ?? "Invalid input.");
        return;
      }
      const id = form.competitor.id;
      startTransition(async () => {
        const res = await fetch(`/api/competitors/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error ?? "Could not update competitor.");
          return;
        }
        setCompetitors((prev) => prev.map((c) => (c.id === id ? (body.data as Competitor) : c)));
        setForm({ mode: "closed" });
      });
    }
  }

  function handleDelete(competitor: Competitor) {
    clearError();
    if (!window.confirm(`Remove ${competitor.name} from your tracked competitors?`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/competitors/${competitor.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not remove competitor.");
        return;
      }
      setCompetitors((prev) => prev.filter((c) => c.id !== competitor.id));
    });
  }

  return (
    <div className="space-y-6">
      {showGeneratingBanner && (
        <div className="alert-success">
          Your welcome report is being generated. Expect it in your inbox within 60 minutes.
        </div>
      )}
      {showEmptyBanner && (
        <div className="alert-info">Add your first competitor to receive your welcome report.</div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Tracked competitors</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {competitors.length} of {limit} competitors used
          </p>
        </div>
        {form.mode === "closed" &&
          (atLimit ? (
            canUpgrade ? (
              <a href="/dashboard/billing" className="btn-primary">
                Upgrade to add more
              </a>
            ) : null
          ) : (
            <button
              type="button"
              onClick={() => {
                clearError();
                setForm({ mode: "add" });
              }}
              className="btn-primary"
            >
              Add competitor
            </button>
          ))}
      </div>

      {atLimit && form.mode === "closed" && (
        <div className="alert-info">
          You&apos;ve reached your plan&apos;s limit of {limit} competitors.{" "}
          {canUpgrade ? (
            <a href="/dashboard/billing" className="link">
              Upgrade your plan
            </a>
          ) : (
            "Remove one to add another."
          )}
        </div>
      )}

      {form.mode !== "closed" && (
        <form action={handleSubmit} className="card space-y-4">
          <div>
            <label htmlFor="name" className="field-label">
              Competitor name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={100}
              defaultValue={form.mode === "edit" ? form.competitor.name : ""}
              className="field-input"
            />
          </div>
          <div>
            <label htmlFor="website_url" className="field-label">
              Website URL
            </label>
            <input
              id="website_url"
              name="website_url"
              type="url"
              required
              placeholder="https://"
              defaultValue={form.mode === "edit" ? form.competitor.website_url : ""}
              className="field-input"
            />
          </div>
          <div>
            <label htmlFor="notes" className="field-label">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              name="notes"
              maxLength={500}
              rows={3}
              defaultValue={form.mode === "edit" ? (form.competitor.notes ?? "") : ""}
              className="field-input"
            />
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? "Saving…" : form.mode === "edit" ? "Save" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                clearError();
                setForm({ mode: "closed" });
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && form.mode === "closed" && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {competitors.map((c) => (
          <li key={c.id} className="card flex items-start justify-between p-4">
            <div className="space-y-1">
              <p className="font-medium">{c.name}</p>
              <a
                href={c.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="link text-sm"
              >
                {c.website_url}
              </a>
              {c.notes && <p className="text-sm text-neutral-500">{c.notes}</p>}
            </div>
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setForm({ mode: "edit", competitor: c });
                }}
                className="font-medium text-rose-600 transition hover:text-rose-500"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleDelete(c)}
                className="font-medium text-rose-600 transition hover:text-rose-500"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
