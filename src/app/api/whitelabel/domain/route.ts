import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { registerDomain, removeDomain } from "@/lib/whitelabel/domain";
import { domainDeps } from "@/lib/whitelabel/domainDeps";
import { gateWhiteLabel } from "@/lib/whitelabel/routeGate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({ domain: z.string().trim().min(1) });

// POST /api/whitelabel/domain — register a custom sender domain with Resend and
// return the DNS records to add (§13.3 steps 1–3).
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const gate = await gateWhiteLabel(supabase);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A domain is required." }, { status: 400 });
  }

  const result = await registerDomain(domainDeps(supabase), gate.userId, parsed.data.domain);
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

// DELETE /api/whitelabel/domain — remove the custom domain.
export async function DELETE() {
  const supabase = createSupabaseServerClient();
  const gate = await gateWhiteLabel(supabase);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { ok } = await removeDomain(domainDeps(supabase), gate.userId);
  if (!ok) return NextResponse.json({ error: "Could not remove the domain." }, { status: 500 });
  return NextResponse.json({ data: { removed: true } });
}
