import { battlecardSchema } from "@/lib/reports/schemas";

// Renders a stored battlecard's structured JSON in the dashboard theme (§14.2).
// Content is parsed defensively so a malformed row degrades gracefully.

function List({ title, items, tone }: { title: string; items: string[]; tone?: "good" | "bad" }) {
  if (items.length === 0) return null;
  const mark =
    tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-rose-500" : "text-neutral-400";
  return (
    <section className="card">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <ul className="mt-3 space-y-1.5 text-sm text-neutral-800">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className={mark} aria-hidden>
              •
            </span>
            {it}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BattlecardView({ content }: { content: unknown }) {
  const parsed = battlecardSchema.safeParse(content);
  if (!parsed.success) {
    return (
      <div className="card text-sm text-neutral-600">This battlecard can&apos;t be displayed.</div>
    );
  }
  const b = parsed.data;

  return (
    <div className="space-y-5">
      <section className="card">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Positioning
        </h3>
        <p className="mt-2 text-sm text-neutral-800">{b.positioning}</p>
        <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Pricing
        </h3>
        <p className="mt-2 text-sm text-neutral-800">{b.pricing}</p>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <List title="Strengths" items={b.strengths} tone="good" />
        <List title="Weaknesses" items={b.weaknesses} tone="bad" />
      </div>

      <List title="Key differentiators" items={b.key_differentiators} />
      <List title="How to win" items={b.how_to_win} tone="good" />
      <List title="Landmines — topics to avoid" items={b.landmines} tone="bad" />
    </div>
  );
}
