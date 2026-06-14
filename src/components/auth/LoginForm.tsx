"use client";

import { useFormState } from "react-dom";

import { loginAction, type ActionResult } from "@/lib/auth/actions";
import { SubmitButton } from "./SubmitButton";

type Props = {
  next?: string;
};

export function LoginForm({ next }: Props) {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(loginAction, null);

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
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
          autoComplete="current-password"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <SubmitButton idleLabel="Sign in" pendingLabel="Signing in…" />
    </form>
  );
}
