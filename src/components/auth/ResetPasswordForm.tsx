"use client";

import Link from "next/link";
import { useFormState } from "react-dom";

import { updatePasswordAction, type ActionResult } from "@/lib/auth/actions";
import { SubmitButton } from "./SubmitButton";

export function ResetPasswordForm() {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    updatePasswordAction,
    null,
  );

  if (state?.ok) {
    return (
      <div className="space-y-3">
        <div
          role="status"
          className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900"
        >
          Password updated.
        </div>
        <Link href="/login" className="text-sm text-blue-600 underline">
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">At least 8 characters.</p>
      </div>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <SubmitButton idleLabel="Update password" pendingLabel="Updating…" />
    </form>
  );
}
