"use client";

import { useFormState } from "react-dom";

import { signupAction, type ActionResult } from "@/lib/auth/actions";
import { SubmitButton } from "./SubmitButton";

export function SignupForm() {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(signupAction, null);

  if (state?.ok) {
    return (
      <div
        role="status"
        className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900"
      >
        Check your email to confirm your account.
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
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Password
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
      <SubmitButton idleLabel="Create account" pendingLabel="Creating account…" />
    </form>
  );
}
