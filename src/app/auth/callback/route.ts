import { NextResponse, type NextRequest } from "next/server";

import { notifyN8nUserConfirmed } from "@/lib/integrations/n8n";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type");
  const rawNext = url.searchParams.get("next");
  // PRD §7.1: after confirming email, new users land at the competitor
  // onboarding screen. Other auth callbacks (login, recovery) override `next`.
  const defaultNext = type === "signup" ? "/dashboard/competitors" : "/dashboard";
  const next = rawNext && rawNext.startsWith("/") ? rawNext : defaultNext;

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login?error=invalid_code", url.origin));
  }

  // Only fire the welcome webhook for fresh signups, not password recovery clicks.
  // The exchange is single-use, so this fires at most once per signup confirmation.
  if (type === "signup" && data.user.email) {
    await notifyN8nUserConfirmed({
      type: "INSERT",
      table: "profiles",
      record: {
        id: data.user.id,
        email: data.user.email,
        created_at: data.user.created_at,
      },
    });
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
