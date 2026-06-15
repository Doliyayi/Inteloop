import Link from "next/link";

import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Sign in — Inteloop" };

type Props = {
  searchParams?: { next?: string };
};

export default function LoginPage({ searchParams }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-950">Welcome back</h1>
        <p className="text-sm text-neutral-500">Sign in to your intelligence desk.</p>
      </div>
      <LoginForm next={searchParams?.next} />
      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="link">
          Forgot password?
        </Link>
        <Link href="/signup" className="link">
          Create an account
        </Link>
      </div>
    </div>
  );
}
