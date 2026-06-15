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
        className="alert-success"
      >
        If that email is registered, you&apos;ll receive a reset link shortly.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="field-label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="field-input"
        />
      </div>
      {state && !state.ok && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <SubmitButton idleLabel="Send reset link" pendingLabel="Sending…" />
    </form>
  );
}
