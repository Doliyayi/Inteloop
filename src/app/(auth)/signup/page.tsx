import Link from "next/link";

import { SignupForm } from "@/components/auth/SignupForm";

export const metadata = { title: "Sign up — Inteloop" };

type Props = { searchParams: { ref?: string } };

export default function SignupPage({ searchParams }: Props) {
  const refCode = typeof searchParams.ref === "string" ? searchParams.ref : undefined;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-950">
          Create your account
        </h1>
        <p className="text-sm text-neutral-500">Start your competitor intelligence trial.</p>
      </div>
      <SignupForm refCode={refCode} />
      <p className="text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="link">
          Sign in
        </Link>
      </p>
    </div>
  );
}
