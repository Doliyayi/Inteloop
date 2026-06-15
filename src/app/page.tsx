import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/Logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Warm mesh gradient that powers the hero — layered radial blooms over a cream
// base, echoing the marketing template.
const HERO_GRADIENT =
  "radial-gradient(55% 55% at 72% 22%, rgba(244,114,182,0.65), transparent 70%)," +
  "radial-gradient(45% 55% at 88% 48%, rgba(251,113,80,0.7), transparent 72%)," +
  "radial-gradient(60% 60% at 28% 18%, rgba(254,205,211,0.75), transparent 70%)," +
  "radial-gradient(50% 50% at 40% 80%, rgba(253,186,116,0.45), transparent 72%)," +
  "linear-gradient(180deg, #fff4ec 0%, #fde9f0 45%, #fff6ee 100%)";

const NAV_LINKS = [
  { label: "How it works", href: "#how" },
  { label: "What you get", href: "#features" },
  { label: "Pricing", href: "#pricing" },
];

const FEATURES = [
  {
    n: "01",
    title: "Competitor tracking",
    body: "Add the rivals that matter. We watch their sites, pricing pages, and the news around them — no manual checking.",
  },
  {
    n: "02",
    title: "Weekly intelligence report",
    body: "Every Monday at 6 AM, a sharp briefing lands in your inbox: what changed last week, why it matters, and what to watch.",
  },
  {
    n: "03",
    title: "Real-time Slack alerts",
    body: "A pricing change, a launch, a key hire, an acquisition — the moment it's material, your team gets pinged in Slack.",
  },
  {
    n: "04",
    title: "Battlecards & API",
    body: "Generate sales-ready battlecards on demand, and pull every signal into your own tools through the Inteloop API.",
  },
];

const STEPS = [
  { n: "1", title: "Tell us who to watch", body: "Add your competitors in under two minutes." },
  { n: "2", title: "We do the digging", body: "We scrape, search, and synthesise every week." },
  { n: "3", title: "You stay ahead", body: "Read the briefing, share the alerts, win the deal." },
];

const TRUSTED_BY = ["Northwind", "Globex", "Initech", "Umbrella", "Hooli"];

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="overflow-x-hidden">
      {/* ===== Hero ===== */}
      <section style={{ background: HERO_GRADIENT }} className="relative">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <Logo />
          <div className="hidden items-center gap-8 text-sm font-medium text-neutral-700 md:flex">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="transition hover:text-neutral-950">
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-neutral-700 transition hover:text-neutral-950 sm:block"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-700"
            >
              Get started
            </Link>
          </div>
        </nav>

        <div className="mx-auto max-w-4xl px-6 pb-24 pt-16 text-center md:pt-24">
          <span className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-white/60 bg-white/50 px-4 py-1.5 text-xs font-medium text-neutral-700 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Competitor intelligence, on autopilot
          </span>

          <h1 className="mt-7 animate-fade-up text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-neutral-950 sm:text-6xl">
            Know what your <span className="font-serif font-normal italic">competitors</span> did
            <br className="hidden sm:block" /> before your next standup
          </h1>

          <p className="mx-auto mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-neutral-700">
            Inteloop watches your market and emails you a crisp intelligence briefing every Monday —
            the changes that matter, the context behind them, and what to watch next.
          </p>

          <div className="mt-9 flex animate-fade-up flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="w-full rounded-full bg-neutral-900 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:bg-neutral-700 sm:w-auto"
            >
              Start tracking — free for a week
            </Link>
            <a
              href="#how"
              className="w-full rounded-full border border-neutral-300 bg-white/70 px-7 py-3.5 text-sm font-semibold text-neutral-800 backdrop-blur transition hover:bg-white sm:w-auto"
            >
              See how it works
            </a>
          </div>

          <p className="mt-5 text-sm text-neutral-600">
            No credit card required · Your first report within the hour
          </p>
        </div>
      </section>

      {/* ===== Trusted by ===== */}
      <section className="border-y border-neutral-100 bg-white py-10">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
            Built for the teams who can&apos;t afford to be surprised
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-5 opacity-60">
            {TRUSTED_BY.map((name) => (
              <span
                key={name}
                className="font-serif text-xl font-medium tracking-tight text-neutral-500"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Features ===== */}
      <section id="features" className="bg-[#fdeee2] py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">
              What you get
            </span>
            <h2 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
              Everything you need to{" "}
              <span className="font-serif font-normal italic">out-position</span> the competition
            </h2>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.n}
                className="group rounded-3xl border border-white bg-white/70 p-7 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-500/10"
              >
                <span className="text-sm font-semibold text-rose-400">{f.n}</span>
                <h3 className="mt-4 text-lg font-semibold text-neutral-950">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section id="how" className="bg-white py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">
              How it works
            </span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
              Live in five minutes
            </h2>
          </div>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-rose-400 to-orange-400 text-lg font-semibold text-white shadow-lg shadow-rose-500/25">
                  {s.n}
                </span>
                <h3 className="mt-5 text-lg font-semibold text-neutral-950">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Closing CTA ===== */}
      <section id="pricing" className="bg-neutral-950 px-6 py-24 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
            Stop guessing what changed.
            <br />
            Start your week <span className="font-serif font-normal italic">already knowing</span>.
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-lg text-neutral-400">
            Add your competitors today and get your first intelligence report within the hour. Free
            for your first week.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="w-full rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 sm:w-auto"
            >
              Get started free
            </Link>
            <Link
              href="/login"
              className="w-full rounded-full border border-neutral-700 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-900 sm:w-auto"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-neutral-200 bg-[#fffaf5] py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-neutral-500 sm:flex-row">
          <Logo />
          <p>© {new Date().getFullYear()} Inteloop. Competitor intelligence, delivered weekly.</p>
        </div>
      </footer>
    </main>
  );
}
