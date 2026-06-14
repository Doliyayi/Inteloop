"use client";

import { useFormState } from "react-dom";

import { updateEmailAction, type ActionResult } from "@/lib/auth/actions";
import { SubmitButton } from "./SubmitButton";

export function UpdateEmailForm() {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(updateEmailAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          New email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          We&apos;ll send a confirmation link to the new address. The change takes effect after you
          click it.
        </p>
      </div>
      {state?.ok && (
        <p role="status" className="text-sm text-green-700">
          Check your new email to confirm the change.
        </p>
      )}
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <SubmitButton idleLabel="Update email" pendingLabel="Sending…" />
    </form>
  );
}
