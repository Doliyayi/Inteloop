"use client";

import { useFormState } from "react-dom";

import { signupAction, type ActionResult } from "@/lib/auth/actions";
import { SubmitButton } from "./SubmitButton";

export function SignupForm({ refCode }: { refCode?: string }) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(signupAction, null);

  if (state?.ok) {
    return (
      <div role="status" className="alert-success">
        Check your email to confirm your account.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {refCode && <input type="hidden" name="ref_code" value={refCode} />}
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
      <div>
        <label htmlFor="password" className="field-label">
          Password
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
      <SubmitButton idleLabel="Create account" pendingLabel="Creating account…" />
    </form>
  );
}
