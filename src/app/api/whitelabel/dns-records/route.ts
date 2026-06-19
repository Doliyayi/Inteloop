import { NextResponse } from "next/server";

import { refreshDomainStatus } from "@/lib/whitelabel/domain";
import { domainDeps } from "@/lib/whitelabel/domainDeps";
import { gateWhiteLabel } from "@/lib/whitelabel/routeGate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET /api/whitelabel/dns-records — current DNS records + verification status
// for the user's domain (§13.3 step 3, §17).
export async function GET() {
  const supabase = createSupabaseServerClient();
  const gate = await gateWhiteLabel(supabase);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const result = await refreshDomainStatus(domainDeps(supabase), gate.userId);
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
