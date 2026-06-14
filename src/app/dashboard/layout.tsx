import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/lib/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="font-semibold">
            Inteloop
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-gray-700 hover:text-black">
              Reports
            </Link>
            <Link href="/dashboard/settings" className="text-gray-700 hover:text-black">
              Settings
            </Link>
            <span className="text-gray-500">{user.email}</span>
            <form action={logoutAction}>
              <button type="submit" className="text-blue-600 underline">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
