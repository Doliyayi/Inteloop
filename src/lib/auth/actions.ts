"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  signupSchema,
  loginSchema,
  passwordResetRequestSchema,
  updatePasswordSchema,
  updateEmailSchema,
} from "./schemas";

export type ActionResult = { ok: true } | { ok: false; error: string };

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function authCallbackUrl(): string {
  return `${appOrigin()}/auth/callback`;
}

export async function signupAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    ref_code: formData.get("ref_code") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${authCallbackUrl()}?type=signup`,
      // Carry the referral code through the email-confirmation flow so the
      // callback can link the referral after the user confirms their email.
      data: parsed.data.ref_code ? { ref_code: parsed.data.ref_code } : undefined,
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      return { ok: false, error: "An account with this email already exists." };
    }
    return { ok: false, error: error.message };
  }

  // Supabase suppresses errors on duplicate signups to prevent email enumeration:
  // it returns a user object whose identities array is empty. Surface this as a
  // duplicate-account error per PRD §6.3.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    return { ok: false, error: "An account with this email already exists." };
  }

  return { ok: true };
}

export async function loginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) return { ok: false, error: "Invalid email or password." };

  const rawNext = formData.get("next");
  const next = typeof rawNext === "string" && rawNext.startsWith("/") ? rawNext : "/dashboard";
  revalidatePath("/", "layout");
  redirect(next);
}

export async function logoutAction() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid email." };
  }

  const supabase = createSupabaseServerClient();
  // Always return ok=true so the response does not reveal whether the email is registered.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${authCallbackUrl()}?type=recovery&next=/auth/reset-password`,
  });

  return { ok: true };
}

export async function updatePasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updatePasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid password." };
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateEmailAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateEmailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid email." };
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ email: parsed.data.email });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteAccountAction(): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const admin = createSupabaseAdminClient();

  // Anonymise PII on the profile. The auth.users row is preserved (banned, not deleted)
  // so historical reports stay linkable.
  await admin
    .from("profiles")
    .update({
      email: `deleted-${user.id}@inteloop.invalid`,
      full_name: null,
      company_name: null,
      mpesa_phone: null,
      cancelled_at: new Date().toISOString(),
      plan: "cancelled",
    })
    .eq("id", user.id);

  // Ban for ~100 years. Banned users are rejected at signInWithPassword.
  await admin.auth.admin.updateUserById(user.id, { ban_duration: "876000h" });

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
