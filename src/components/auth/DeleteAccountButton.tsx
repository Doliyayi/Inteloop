"use client";

import { useTransition } from "react";

import { deleteAccountAction } from "@/lib/auth/actions";

export function DeleteAccountButton() {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (
      !window.confirm(
        "Permanently delete your account? This anonymises your data and cannot be undone.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deleteAccountAction();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete account"}
    </button>
  );
}
