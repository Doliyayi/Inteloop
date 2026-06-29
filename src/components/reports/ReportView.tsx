"use client";

import {
  weeklyReportSchema,
  welcomeReportSchema,
  type WeeklyReport,
  type WelcomeReport,
} from "@/lib/reports/schemas";

type NewsItem = { headline: string; summary: string; date: string; url: string };

// Rotating per-competitor accent system. Full class strings so Tailwind JIT finds them.
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const accentFor = (i: number) => COMP_ACCENTS[i % COMP_ACCENTS.length]!;

const COMP_ACCENTS = [
  {
    leftBorder: "border-l-rose-400",
    avatarBg: "bg-rose-500",
    badge: "bg-rose-100 text-rose-700",
    ring: "ring-rose-100",
  },
  {
    leftBorder: "border-l-violet-400",
    avatarBg: "bg-violet-500",
    badge: "bg-violet-100 text-violet-700",
    ring: "ring-violet-100",
  },
  {
    leftBorder: "border-l-sky-400",
    avatarBg: "bg-sky-500",
    badge: "bg-sky-100 text-sky-700",
    ring: "ring-sky-100",
  },
  {
    leftBorder: "border-l-teal-400",
    avatarBg: "bg-teal-500",
    badge: "bg-teal-100 text-teal-700",
    ring: "ring-teal-100",
  },
] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">
      {children}
    </p>
  );
}

function NewsStrip({ news }: { news: NewsItem[] }) {
  if (news.length === 0) {
    return <p className="text-xs italic text-neutral-400">No notable news this week.</p>;
  }
  return (
    <div className="space-y-2">
      {news.map((n, i) => (
        <a
          key={i}
          href={n.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3 transition hover:border-neutral-200 hover:bg-white hover:shadow-sm"
        >
          <span className="mt-0.5 shrink-0 text-neutral-300 transition group-hover:text-rose-500">
            ↗
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-neutral-900 transition group-hover:text-rose-600">
              {n.headline}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-neutral-500">
              {n.summary}
            </p>
          </div>
          {n.date && (
            <span className="shrink-0 font-mono text-[10px] text-neutral-400">{n.date}</span>
          )}
        </a>
      ))}
    </div>
  );
}

function AttackOpportunity({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 p-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 text-base leading-none">⚔️</span>
        <p className="text-sm leading-relaxed text-amber-900">{text}</p>
      </div>
    </div>
  );
}

function YourMove({ moves }: { moves: string[] }) {
  if (moves.length === 0) return null;
  return (
    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-600">
        Your response
      </p>
      <ul className="space-y-2">
        {moves.map((m, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-emerald-900">
            <span className="mt-px shrink-0 font-bold text-emerald-400">→</span>
            <span className="leading-relaxed">{m}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WeeklyBody({ report }: { report: WeeklyReport }) {
  const competitorsWithImplications = report.competitors.filter((c) => c.strategic_implications);

  return (
    <div className="space-y-6">
      {/* Report date */}
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">
        {report.report_date}
      </p>

      {/* Major change alert */}
      {report.major_change && report.major_change_summary && (
        <div className="relative overflow-hidden rounded-2xl bg-rose-600 px-6 py-5 text-white shadow-lg shadow-rose-500/20">
          {/* Decorative orbs */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-6 size-28 rounded-full bg-white/10"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-8 left-8 size-36 rounded-full bg-white/5"
          />
          <div className="relative">
            <div className="mb-2 flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-white" />
              </span>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-200">
                Major change detected
              </p>
            </div>
            <p className="text-base font-semibold leading-snug">{report.major_change_summary}</p>
          </div>
        </div>
      )}

      {/* Executive summary */}
      {report.executive_summary.length > 0 && (
        <section>
          <Eyebrow>This week at a glance</Eyebrow>
          <div className="space-y-2">
            {report.executive_summary.map((bullet, i) => (
              <div
                key={i}
                className="flex gap-4 rounded-xl border border-neutral-100 bg-white p-4 shadow-sm"
              >
                <span className="shrink-0 font-mono text-xs font-bold text-rose-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-sm leading-relaxed text-neutral-800">{bullet}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Attack Playbook — the one dark panel ── */}
      {competitorsWithImplications.length > 0 && (
        <section className="rounded-2xl p-6 shadow-xl" style={{ background: "#141210" }}>
          <p
            className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#f59e0b" }}
          >
            Attack playbook
          </p>
          <p className="mb-5 text-xs text-neutral-500">
            Where you have an opening this week. Act on at least one.
          </p>
          <div className="space-y-5">
            {report.competitors.map((c, i) => {
              if (!c.strategic_implications) return null;
              const accent = accentFor(i);
              return (
                <div key={i} className="flex gap-3">
                  <div
                    className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${accent.avatarBg}`}
                  >
                    {initials(c.name)}
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold text-neutral-400">{c.name}</p>
                    <p className="text-sm leading-relaxed text-neutral-200">
                      {c.strategic_implications}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Per-competitor breakdown */}
      {report.competitors.map((c, i) => {
        const accent = accentFor(i);
        return (
          <section
            key={i}
            className={`overflow-hidden rounded-2xl border border-neutral-200/70 border-l-4 bg-white shadow-sm ${accent.leftBorder}`}
          >
            {/* Competitor header */}
            <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4">
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ring-4 ${accent.avatarBg} ${accent.ring}`}
              >
                {initials(c.name)}
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-950">{c.name}</h3>
                <span
                  className={`mt-0.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${accent.badge}`}
                >
                  Under watch
                </span>
              </div>
            </div>

            <div className="space-y-5 p-6">
              {/* What changed */}
              <div>
                <Eyebrow>What changed this week</Eyebrow>
                <p className="text-sm leading-relaxed text-neutral-700">{c.weekly_delta}</p>
              </div>

              {/* Messaging shift */}
              {c.messaging_changes && (
                <div>
                  <Eyebrow>Messaging shift</Eyebrow>
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                    <p className="text-sm italic leading-relaxed text-neutral-600">
                      &ldquo;{c.messaging_changes}&rdquo;
                    </p>
                  </div>
                </div>
              )}

              {/* In the news */}
              <div>
                <Eyebrow>In the news</Eyebrow>
                <NewsStrip news={c.news} />
              </div>

              {/* Attack opportunity */}
              {c.strategic_implications && (
                <div>
                  <Eyebrow>Attack opportunity</Eyebrow>
                  <AttackOpportunity text={c.strategic_implications} />
                </div>
              )}

              {/* Your response */}
              {c.signals_to_watch.length > 0 && (
                <div>
                  <Eyebrow>Signals &amp; response</Eyebrow>
                  <YourMove moves={c.signals_to_watch} />
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function WelcomeBody({ report }: { report: WelcomeReport }) {
  return (
    <div className="space-y-6">
      {report.competitors.map((c, i) => {
        const accent = accentFor(i);
        return (
          <section
            key={i}
            className={`overflow-hidden rounded-2xl border border-neutral-200/70 border-l-4 bg-white shadow-sm ${accent.leftBorder}`}
          >
            <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4">
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ring-4 ${accent.avatarBg} ${accent.ring}`}
              >
                {initials(c.name)}
              </div>
              <h3 className="text-base font-bold text-neutral-950">{c.name}</h3>
            </div>

            {c.scrape_limited && (
              <div className="border-b border-amber-100 bg-amber-50 px-6 py-2.5">
                <p className="text-xs text-amber-700">
                  ⚠ Limited data available — some sections may be incomplete.
                </p>
              </div>
            )}

            <div className="space-y-5 p-6">
              <div>
                <Eyebrow>Snapshot</Eyebrow>
                <p className="text-sm leading-relaxed text-neutral-700">{c.snapshot}</p>
              </div>
              <div>
                <Eyebrow>Website signals</Eyebrow>
                <p className="text-sm leading-relaxed text-neutral-700">{c.website_signals}</p>
              </div>
              <div>
                <Eyebrow>In the news</Eyebrow>
                <NewsStrip news={c.news} />
              </div>
              {c.what_to_watch.length > 0 && (
                <div>
                  <Eyebrow>What to watch</Eyebrow>
                  <YourMove moves={c.what_to_watch} />
                </div>
              )}
            </div>
          </section>
        );
      })}

      <p className="border-t border-neutral-100 pt-5 text-center text-sm italic text-neutral-500">
        {report.closing_line}
      </p>
    </div>
  );
}

export function ReportView({ reportType, content }: { reportType: string; content: unknown }) {
  if (reportType === "welcome") {
    const parsed = welcomeReportSchema.safeParse(content);
    if (parsed.success) return <WelcomeBody report={parsed.data} />;
  } else if (reportType === "weekly" || reportType === "daily") {
    const parsed = weeklyReportSchema.safeParse(content);
    if (parsed.success) return <WeeklyBody report={parsed.data} />;
  }

  return (
    <div className="card text-sm text-neutral-600">
      This report can&apos;t be displayed in the dashboard yet.
    </div>
  );
}
