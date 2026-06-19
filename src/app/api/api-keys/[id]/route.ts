import { NextResponse, type NextRequest } from "next/server";

import { revokeApiKey } from "@/lib/apikeys/manage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// DELETE /api/api-keys/[id] — revoke a key (§15.3). Idempotent; RLS + the
// explicit user_id filter scope it to the owner.
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ok } = await revokeApiKey(supabase, user.id, params.id);
  if (!ok) return NextResponse.json({ error: "Could not revoke key." }, { status: 500 });
  return NextResponse.json({ data: { revoked: true } });
}
