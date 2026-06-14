import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-3xl font-semibold">Inteloop</h1>
      <p className="max-w-md text-center text-gray-500">
        Weekly competitor intelligence reports for B2B marketing teams.
      </p>
      <div className="flex gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
