import Link from "next/link";

export const metadata = { title: "Dashboard — Inteloop" };

export default function DashboardHomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
        Your <span className="font-serif font-normal italic">intelligence</span> desk
      </h1>

      <div className="card flex flex-col items-start gap-4 p-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          Report pending
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-neutral-950">
            Your first report is on its way
          </h2>
          <p className="text-sm text-neutral-600">
            We&apos;re putting together your baseline now. After that, a fresh briefing lands every
            Monday morning.
          </p>
        </div>
        <Link href="/dashboard/competitors" className="btn-primary">
          Manage competitors
        </Link>
      </div>
    </div>
  );
}
