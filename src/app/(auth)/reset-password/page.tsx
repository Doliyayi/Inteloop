import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "Set a new password — Inteloop" };

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Set a new password</h1>
        <p className="text-sm text-gray-500">Choose something you haven&apos;t used elsewhere.</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
