import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { isValidSlackWebhookUrl, slack } from "@/lib/integrations/slack";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// §12.3: send a test message to the configured webhook. Accepts an explicit
// url (to test before saving) or falls back to the saved one.
const bodySchema = z.object({
  webhook_url: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — fall back to the saved webhook.
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  let webhookUrl = parsed.data.webhook_url?.trim();
  if (!webhookUrl) {
    const { data } = await supabase
      .from("profiles")
      .select("slack_webhook_url")
      .eq("id", user.id)
      .maybeSingle();
    webhookUrl = (data as { slack_webhook_url: string | null } | null)?.slack_webhook_url ?? "";
  }

  if (!webhookUrl || !isValidSlackWebhookUrl(webhookUrl)) {
    return NextResponse.json({ error: "No valid Slack webhook configured." }, { status: 400 });
  }

  const result = await slack().send(webhookUrl, {
    text: "✅ Inteloop is connected. You'll get an alert here when we detect a major competitive change.",
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: `Slack rejected the test message (${result.reason}).` },
      { status: 502 },
    );
  }
  return NextResponse.json({ data: { sent: true } });
}
