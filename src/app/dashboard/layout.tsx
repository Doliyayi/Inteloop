import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardNav } from "@/components/DashboardNav";
import { Logo } from "@/components/Logo";
import { logoutAction } from "@/lib/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="app-surface min-h-screen">
      <header className="sticky top-0 z-10 border-b border-neutral-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard">
            <Logo />
          </Link>
          <DashboardNav />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-neutral-500 sm:block">{user.email}</span>
            <form action={logoutAction}>
              <button type="submit" className="btn-secondary px-4 py-1.5">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
    </div>
  );
}
