"use client";

import { useFormState } from "react-dom";

import { updateEmailAction, type ActionResult } from "@/lib/auth/actions";
import { SubmitButton } from "./SubmitButton";

export function UpdateEmailForm() {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(updateEmailAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="email" className="field-label">
          New email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="field-input"
        />
        <p className="field-hint">
          We&apos;ll send a confirmation link to the new address. The change takes effect after you
          click it.
        </p>
      </div>
      {state?.ok && (
        <p role="status" className="text-sm font-medium text-emerald-700">
          Check your new email to confirm the change.
        </p>
      )}
      {state && !state.ok && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <SubmitButton idleLabel="Update email" pendingLabel="Sending…" />
    </form>
  );
}
