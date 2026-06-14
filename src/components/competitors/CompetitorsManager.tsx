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
};

type FormState = { mode: "closed" } | { mode: "add" } | { mode: "edit"; competitor: Competitor };

export function CompetitorsManager({ initial, welcomeReportSent }: Props) {
  const [competitors, setCompetitors] = useState<Competitor[]>(initial);
  const [form, setForm] = useState<FormState>({ mode: "closed" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const showGeneratingBanner = competitors.length > 0 && !welcomeReportSent;
  const showEmptyBanner = competitors.length === 0;

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
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          Your welcome report is being generated. Expect it in your inbox within 60 minutes.
        </div>
      )}
      {showEmptyBanner && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          Add your first competitor to receive your welcome report.
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tracked competitors</h1>
        {form.mode === "closed" && (
          <button
            type="button"
            onClick={() => {
              clearError();
              setForm({ mode: "add" });
            }}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Add competitor
          </button>
        )}
      </div>

      {form.mode !== "closed" && (
        <form
          action={handleSubmit}
          className="space-y-4 rounded-md border border-gray-200 bg-white p-6"
        >
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
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
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="website_url" className="block text-sm font-medium text-gray-700">
              Website URL
            </label>
            <input
              id="website_url"
              name="website_url"
              type="url"
              required
              placeholder="https://"
              defaultValue={form.mode === "edit" ? form.competitor.website_url : ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              name="notes"
              maxLength={500}
              rows={3}
              defaultValue={form.mode === "edit" ? (form.competitor.notes ?? "") : ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : form.mode === "edit" ? "Save" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                clearError();
                setForm({ mode: "closed" });
              }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && form.mode === "closed" && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {competitors.map((c) => (
          <li
            key={c.id}
            className="flex items-start justify-between rounded-md border border-gray-200 bg-white p-4"
          >
            <div className="space-y-1">
              <p className="font-medium">{c.name}</p>
              <a
                href={c.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 underline"
              >
                {c.website_url}
              </a>
              {c.notes && <p className="text-sm text-gray-500">{c.notes}</p>}
            </div>
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setForm({ mode: "edit", competitor: c });
                }}
                className="text-blue-600 underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleDelete(c)}
                className="text-red-600 underline"
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
