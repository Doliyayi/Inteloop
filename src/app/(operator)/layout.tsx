import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// Operator-only route group. Guards every page within (operator)/ by verifying
// the authenticated user has is_operator = true on their profile.
// The page-level queries all use createSupabaseAdminClient (bypasses RLS),
// so this layout is the sole security gate for all customer data they expose.
export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_operator")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_operator) redirect("/dashboard");

  return (
    <div className="app-surface min-h-screen">
      <header className="sticky top-0 z-10 border-b border-neutral-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <span className="text-sm font-semibold tracking-tight text-neutral-950">
            Inteloop Operator
          </span>
          <nav className="flex gap-4 text-sm text-neutral-500">
            <a href="/internal/retention" className="hover:text-neutral-900">
              Retention
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
    </div>
  );
}
