import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateReferralCode } from "./codes";

export type ReferralStats = {
  code: string;
  link: string;
  signups: number;
  conversions: number;
};

function referralLink(code: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${origin}/signup?ref=${code}`;
}

// Returns the user's existing referral code, or creates one if this is their first request.
// Retries once on the rare collision — the unique constraint is the authoritative guard.
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("referral_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return existing.code;

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateReferralCode();
    const { error } = await admin.from("referral_codes").insert({ user_id: userId, code });

    if (!error) return code;
    // 23505 = unique_violation; regenerate a different code on collision.
    if ((error as { code?: string }).code !== "23505") throw error;
  }

  throw new Error("Failed to generate a unique referral code after 3 attempts.");
}

export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const admin = createSupabaseAdminClient();

  const code = await getOrCreateReferralCode(userId);

  const { data: rows } = await admin
    .from("referrals")
    .select("converted_at")
    .eq("referrer_id", userId);

  const signups = rows?.length ?? 0;
  const conversions = rows?.filter((r) => r.converted_at != null).length ?? 0;

  return { code, link: referralLink(code), signups, conversions };
}

// Called at email-confirmation time (auth/callback) to link a referred signup.
// No-ops if the code doesn't exist, the referred user already has a referral row,
// or the referrer is trying to refer themselves.
export async function linkReferral(referredUserId: string, code: string): Promise<void> {
  if (!code) return;
  const admin = createSupabaseAdminClient();

  const { data: referralCode } = await admin
    .from("referral_codes")
    .select("user_id")
    .eq("code", code)
    .maybeSingle();

  if (!referralCode) return;
  const referrerId = referralCode.user_id;
  if (referrerId === referredUserId) return; // self-referral: ignore

  await admin
    .from("referrals")
    .upsert(
      { referrer_id: referrerId, referred_id: referredUserId },
      { onConflict: "referred_id", ignoreDuplicates: true },
    );
}

// Called from the Stripe webhook when a referred user completes their first checkout.
export async function convertReferral(referredUserId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("referrals")
    .update({ converted_at: new Date().toISOString() })
    .eq("referred_id", referredUserId)
    .is("converted_at", null);
}
