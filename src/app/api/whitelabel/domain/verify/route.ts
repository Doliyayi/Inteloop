import { NextResponse } from "next/server";

import { refreshDomainStatus } from "@/lib/whitelabel/domain";
import { domainDeps } from "@/lib/whitelabel/domainDeps";
import { gateWhiteLabel } from "@/lib/whitelabel/routeGate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// POST /api/whitelabel/domain/verify — trigger a Resend verification check and
// flip white_label_domain_verified when it passes (§13.3 step 6).
export async function POST() {
  const supabase = createSupabaseServerClient();
  const gate = await gateWhiteLabel(supabase);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const result = await refreshDomainStatus(domainDeps(supabase), gate.userId, {
    triggerVerify: true,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    data: {
      domain: result.domain,
      status: result.status,
      verified: result.verified,
      records: result.records,
    },
  });
}
