"use client";

import { useFormStatus } from "react-dom";

type Props = {
  idleLabel: string;
  pendingLabel: string;
};

export function SubmitButton({ idleLabel, pendingLabel }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
