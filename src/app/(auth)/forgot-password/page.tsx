import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Reset password — Inteloop" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-950">
          Reset your password
        </h1>
        <p className="text-sm text-neutral-500">
          We&apos;ll email you a link to set a new password.
        </p>
      </div>
      <ForgotPasswordForm />
      <p className="text-sm text-neutral-500">
        Back to{" "}
        <Link href="/login" className="link">
          sign in
        </Link>
      </p>
    </div>
  );
}
