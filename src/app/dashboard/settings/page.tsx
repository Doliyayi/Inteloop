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
    <div className="space-y-10">
      <section>
        <h1 className="text-xl font-semibold">Settings</h1>
      </section>

      <section className="space-y-3 rounded-md border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold">Email</h2>
        <p className="text-sm text-gray-500">Current: {user?.email}</p>
        <UpdateEmailForm />
      </section>

      <section className="space-y-3 rounded-md border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold">Password</h2>
        <UpdatePasswordSettingsForm />
      </section>

      <section className="space-y-3 rounded-md border border-red-200 bg-white p-6">
        <h2 className="text-base font-semibold text-red-700">Danger zone</h2>
        <p className="text-sm text-gray-500">
          Deleting your account anonymises your data and cancels any active subscription. This
          cannot be undone.
        </p>
        <DeleteAccountButton />
      </section>
    </div>
  );
}
