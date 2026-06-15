import Link from "next/link";

import { SignupForm } from "@/components/auth/SignupForm";

export const metadata = { title: "Sign up — Inteloop" };

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-950">
          Create your account
        </h1>
        <p className="text-sm text-neutral-500">Start your competitor intelligence trial.</p>
      </div>
      <SignupForm />
      <p className="text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="link">
          Sign in
        </Link>
      </p>
    </div>
  );
}
