import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requirePlanCapability } from "@/lib/billing/capabilities";
import { createApiKey, listApiKeys } from "@/lib/apikeys/manage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const createSchema = z.object({
  label: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().max(50, "Label must be at most 50 characters.").nullable(),
  ),
});

async function gate(supabase: ReturnType<typeof createSupabaseServerClient>, userId: string) {
  const { data } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
  return requirePlanCapability((data as { plan: string } | null)?.plan, "apiAccess");
}

// GET /api/api-keys — list the user's keys (prefixes only; never the secret).
export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const g = await gate(supabase, user.id);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  return NextResponse.json({ data: await listApiKeys(supabase, user.id) });
}

// POST /api/api-keys — create a key; the plaintext is returned ONCE (§15.4).
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const g = await gate(supabase, user.id);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body allowed (no label)
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const result = await createApiKey(supabase, user.id, parsed.data.label);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(
    { data: { key: result.key, plaintext: result.plaintext } },
    { status: 201 },
  );
}
