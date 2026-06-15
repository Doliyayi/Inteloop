import Link from "next/link";

import { Logo } from "@/components/Logo";

const AUTH_GRADIENT =
  "radial-gradient(50% 45% at 80% 10%, rgba(244,114,182,0.35), transparent 70%)," +
  "radial-gradient(45% 45% at 12% 8%, rgba(253,186,116,0.3), transparent 70%)," +
  "linear-gradient(180deg, #fff4ec 0%, #fdebf1 100%)";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ background: AUTH_GRADIENT }}
      className="flex min-h-screen items-center justify-center px-4 py-12"
    >
      <div className="w-full max-w-sm space-y-6">
        <Link href="/" className="flex justify-center">
          <Logo />
        </Link>
        <div className="card p-7 shadow-xl shadow-rose-500/5">{children}</div>
      </div>
    </div>
  );
}
