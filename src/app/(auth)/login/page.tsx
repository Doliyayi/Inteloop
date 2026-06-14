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
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="text-sm text-gray-500">Welcome back.</p>
      </div>
      <LoginForm next={searchParams?.next} />
      <div className="flex items-center justify-between text-sm text-gray-500">
        <Link href="/forgot-password" className="text-blue-600 underline">
          Forgot password?
        </Link>
        <Link href="/signup" className="text-blue-600 underline">
          Create an account
        </Link>
      </div>
    </div>
  );
}
