import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { isValidSlackWebhookUrl } from "@/lib/integrations/slack";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// §12: save (or clear) the user's Slack incoming-webhook URL. A non-Slack
// domain is rejected with an inline error (§12.3).
const bodySchema = z.object({
  // Empty string clears the integration.
  webhook_url: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidSlackWebhookUrl(v), {
      message: "Enter a valid Slack incoming webhook URL (https://hooks.slack.com/services/...).",
    }),
});

export async function PUT(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const value = parsed.data.webhook_url === "" ? null : parsed.data.webhook_url;
  const { error } = await supabase
    .from("profiles")
    .update({ slack_webhook_url: value })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: { connected: value !== null } });
}
