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
    <button type="button" onClick={handleClick} disabled={pending} className="btn-danger">
      {pending ? "Deleting…" : "Delete account"}
    </button>
  );
}
