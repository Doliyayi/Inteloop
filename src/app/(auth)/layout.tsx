import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <Link href="/" className="block text-center text-xl font-semibold">
          Inteloop
        </Link>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
