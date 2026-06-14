"use client";

import { useFormState } from "react-dom";

import { updatePasswordAction, type ActionResult } from "@/lib/auth/actions";
import { SubmitButton } from "./SubmitButton";

export function UpdatePasswordSettingsForm() {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(
    updatePasswordAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
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
      {state?.ok && (
        <p role="status" className="text-sm text-green-700">
          Password updated.
        </p>
      )}
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <SubmitButton idleLabel="Update password" pendingLabel="Updating…" />
    </form>
  );
}
