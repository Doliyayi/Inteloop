import {
  weeklyReportSchema,
  welcomeReportSchema,
  type WeeklyReport,
  type WelcomeReport,
} from "@/lib/reports/schemas";

// Renders a stored report's structured JSON in the dashboard theme. Same data
// that drives the email (§11.3) — rendered here as React so it stays in sync
// and is mobile-friendly. Content is parsed defensively; a shape we can't
// recognise falls back to a readable message rather than throwing.

type NewsItem = { headline: string; summary: string; date: string; url: string };

function NewsList({ news }: { news: NewsItem[] }) {
  if (news.length === 0) {
    return <p className="text-sm italic text-neutral-400">No notable news.</p>;
  }
  return (
    <ul className="space-y-2">
      {news.map((n, i) => (
        <li key={i} className="text-sm">
          <a
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-rose-600 underline-offset-2 hover:underline"
          >
            {n.headline}
          </a>
          {n.date ? <span className="ml-1 text-neutral-400">({n.date})</span> : null}
          <p className="text-neutral-600">{n.summary}</p>
        </li>
      ))}
    </ul>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">
      {children}
    </h4>
  );
}

function WelcomeBody({ report }: { report: WelcomeReport }) {
  return (
    <div className="space-y-6">
      {report.competitors.map((c, i) => (
        <section key={i} className="card">
          <h3 className="text-lg font-semibold text-neutral-950">{c.name}</h3>
          {c.scrape_limited ? (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Limited data available for {c.name}.
            </p>
          ) : null}
          <SectionLabel>Snapshot</SectionLabel>
          <p className="text-sm text-neutral-700">{c.snapshot}</p>
          <SectionLabel>Website signals</SectionLabel>
          <p className="text-sm text-neutral-700">{c.website_signals}</p>
          <SectionLabel>In the news</SectionLabel>
          <NewsList news={c.news} />
          {c.what_to_watch.length > 0 ? (
            <>
              <SectionLabel>What to watch</SectionLabel>
              <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
                {c.what_to_watch.map((w, j) => (
                  <li key={j}>{w}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ))}
      <p className="border-t border-neutral-200 pt-4 text-sm italic text-neutral-600">
        {report.closing_line}
      </p>
    </div>
  );
}

function WeeklyBody({ report }: { report: WeeklyReport }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-500">{report.report_date}</p>

      {report.major_change && report.major_change_summary ? (
        <div className="rounded-xl border-l-4 border-rose-500 bg-rose-50/70 p-4">
          <p className="text-sm font-semibold text-rose-800">Major change detected</p>
          <p className="mt-1 text-sm text-rose-900">{report.major_change_summary}</p>
        </div>
      ) : null}

      {report.executive_summary.length > 0 ? (
        <section className="card">
          <h3 className="text-base font-semibold text-neutral-950">Executive summary</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
            {report.executive_summary.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.competitors.map((c, i) => (
        <section key={i} className="card">
          <h3 className="text-lg font-semibold text-neutral-950">{c.name}</h3>
          <SectionLabel>What changed this week</SectionLabel>
          <p className="text-sm text-neutral-700">{c.weekly_delta}</p>
          <SectionLabel>In the news</SectionLabel>
          <NewsList news={c.news} />
          {c.messaging_changes ? (
            <>
              <SectionLabel>Messaging changes</SectionLabel>
              <p className="text-sm text-neutral-700">{c.messaging_changes}</p>
            </>
          ) : null}
          <SectionLabel>Strategic implications</SectionLabel>
          <p className="text-sm text-neutral-700">{c.strategic_implications}</p>
          {c.signals_to_watch.length > 0 ? (
            <>
              <SectionLabel>Signals to watch</SectionLabel>
              <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
                {c.signals_to_watch.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ))}
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
