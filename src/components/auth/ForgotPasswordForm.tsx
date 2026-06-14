"use client";

import { useFormState } from "react-dom";

import { requestPasswordResetAction, type ActionResult } from "@/lib/auth/actions";
import { SubmitButton } from "./SubmitButton";

export function ForgotPasswordForm() {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    requestPasswordResetAction,
    null,
  );

  if (state?.ok) {
    return (
      <div
        role="status"
        className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900"
      >
        If that email is registered, you&apos;ll receive a reset link shortly.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <SubmitButton idleLabel="Send reset link" pendingLabel="Sending…" />
    </form>
  );
}
