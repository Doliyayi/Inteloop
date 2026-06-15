import { DeleteAccountButton } from "@/components/auth/DeleteAccountButton";
import { UpdateEmailForm } from "@/components/auth/UpdateEmailForm";
import { UpdatePasswordSettingsForm } from "@/components/auth/UpdatePasswordSettingsForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings — Inteloop" };

export default async function SettingsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The dashboard layout guards against unauthenticated access; `user` is non-null here.

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Settings</h1>

      <section className="card space-y-3">
        <h2 className="text-base font-semibold text-neutral-950">Email</h2>
        <p className="text-sm text-neutral-500">Current: {user?.email}</p>
        <UpdateEmailForm />
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-semibold text-neutral-950">Password</h2>
        <UpdatePasswordSettingsForm />
      </section>

      <section className="card space-y-3 border-rose-200">
        <h2 className="text-base font-semibold text-rose-700">Danger zone</h2>
        <p className="text-sm text-neutral-500">
          Deleting your account anonymises your data and cancels any active subscription. This
          cannot be undone.
        </p>
        <DeleteAccountButton />
      </section>
    </div>
  );
}
