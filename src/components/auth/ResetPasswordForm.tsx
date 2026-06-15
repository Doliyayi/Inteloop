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
          className="alert-success"
        >
          Password updated.
        </div>
        <Link href="/login" className="link text-sm">
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
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
      {state && !state.ok && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <SubmitButton idleLabel="Update password" pendingLabel="Updating…" />
    </form>
  );
}
