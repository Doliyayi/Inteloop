import { CompetitorsManager, type Competitor } from "@/components/competitors/CompetitorsManager";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Competitors — Inteloop" };

export default async function CompetitorsPage() {
  const supabase = createSupabaseServerClient();
  // Layout already guards on auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [competitorsResult, profileResult] = await Promise.all([
    supabase
      .from("competitors")
      .select("id, name, website_url, notes, is_active, created_at, updated_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("welcome_report_sent").eq("id", user!.id).single(),
  ]);

  const competitors = (competitorsResult.data ?? []) as Competitor[];
  const welcomeReportSent = profileResult.data?.welcome_report_sent ?? false;

  return <CompetitorsManager initial={competitors} welcomeReportSent={welcomeReportSent} />;
}
