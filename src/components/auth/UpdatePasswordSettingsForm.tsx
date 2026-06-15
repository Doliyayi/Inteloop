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
        <label htmlFor="password" className="field-label">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          className="field-input"
        />
        <p className="field-hint">At least 8 characters.</p>
      </div>
      {state?.ok && (
        <p role="status" className="text-sm font-medium text-emerald-700">
          Password updated.
        </p>
      )}
      {state && !state.ok && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <SubmitButton idleLabel="Update password" pendingLabel="Updating…" />
    </form>
  );
}
