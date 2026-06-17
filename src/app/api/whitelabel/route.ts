import { NextResponse, type NextRequest } from "next/server";

import { requirePlanCapability } from "@/lib/billing/capabilities";
import { whiteLabelUpdateSchema } from "@/lib/whitelabel/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// PUT /api/whitelabel — save white-label configuration (§13). Gated to plans
// with the whiteLabel capability (Growth/Pro); a downgrade returns 403.
export async function PUT(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  const plan = (profile as { plan: string } | null)?.plan;

  const gate = requirePlanCapability(plan, "whiteLabel");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = whiteLabelUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const { enabled, sender_name, logo_url, footer_text } = parsed.data;

  const { error } = await supabase
    .from("profiles")
    .update({
      white_label_enabled: enabled,
      white_label_sender_name: sender_name,
      white_label_logo_url: logo_url,
      white_label_footer_text: footer_text,
    })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: { enabled } });
}
