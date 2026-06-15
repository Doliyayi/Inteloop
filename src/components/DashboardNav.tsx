"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Home", exact: true },
  { href: "/dashboard/reports", label: "Reports", exact: false },
  { href: "/dashboard/competitors", label: "Competitors", exact: false },
  { href: "/dashboard/settings", label: "Settings", exact: false },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              active
                ? "rounded-full bg-rose-50 px-3.5 py-1.5 text-sm font-semibold text-rose-700"
                : "rounded-full px-3.5 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
