import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!ANON || !SERVICE) {
  throw new Error(
    "SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set. Run pnpm db:start first.",
  );
}

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function userClient(): SupabaseClient {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe("Auth", () => {
  describe("on_auth_user_created trigger", () => {
    let userId = "";
    const email = `trigger-${randomUUID()}@inteloop.test`;

    afterAll(async () => {
      if (userId) await admin.auth.admin.deleteUser(userId);
    });

    it("creates a profile row with PRD §16.1 defaults", async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: "TestPassword123!",
        email_confirm: true,
      });
      expect(error).toBeNull();
      userId = data.user!.id;

      const { data: profile } = await admin
        .from("profiles")
        .select("id, email, plan, welcome_report_sent, trial_started_at, currency")
        .eq("id", userId)
        .single();

      expect(profile?.id).toBe(userId);
      expect(profile?.email).toBe(email);
      expect(profile?.plan).toBe("trial");
      expect(profile?.welcome_report_sent).toBe(false);
      expect(profile?.currency).toBe("USD");
      expect(profile?.trial_started_at).toBeTruthy();
    });
  });

  describe("login", () => {
    let userId = "";
    const email = `login-${randomUUID()}@inteloop.test`;
    const password = "TestPassword123!";

    beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error("user not created");
      userId = data.user.id;
    });

    afterAll(async () => {
      if (userId) await admin.auth.admin.deleteUser(userId);
    });

    it("succeeds with the correct credentials", async () => {
      const client = userClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      expect(error).toBeNull();
      expect(data.user?.id).toBe(userId);
    });

    it("returns an Invalid-credentials error on a wrong password", async () => {
      const client = userClient();
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password: "wrong-password",
      });
      expect(data.user).toBeNull();
      expect(error?.message.toLowerCase()).toMatch(/invalid/);
    });

    it("returns an Invalid-credentials error for an unknown email", async () => {
      const client = userClient();
      const { error } = await client.auth.signInWithPassword({
        email: `nobody-${randomUUID()}@inteloop.test`,
        password: "anything-12345",
      });
      expect(error?.message.toLowerCase()).toMatch(/invalid/);
    });
  });

  describe("delete-account (anonymise + ban)", () => {
    let userId = "";
    const email = `delete-${randomUUID()}@inteloop.test`;
    const password = "TestPassword123!";

    beforeAll(async () => {
      const { data } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      userId = data.user!.id;
    });

    afterAll(async () => {
      if (userId) await admin.auth.admin.deleteUser(userId);
    });

    it("anonymises the profile and prevents future logins", async () => {
      // Replicate deleteAccountAction: anonymise then ban.
      const anonResult = await admin
        .from("profiles")
        .update({
          email: `deleted-${userId}@inteloop.invalid`,
          full_name: null,
          company_name: null,
          mpesa_phone: null,
          cancelled_at: new Date().toISOString(),
          plan: "cancelled",
        })
        .eq("id", userId);
      expect(anonResult.error).toBeNull();

      const banResult = await admin.auth.admin.updateUserById(userId, {
        ban_duration: "876000h",
      });
      expect(banResult.error).toBeNull();

      const { data: profile } = await admin
        .from("profiles")
        .select("email, full_name, company_name, plan, cancelled_at")
        .eq("id", userId)
        .single();
      expect(profile?.email).toMatch(/^deleted-/);
      expect(profile?.full_name).toBeNull();
      expect(profile?.company_name).toBeNull();
      expect(profile?.plan).toBe("cancelled");
      expect(profile?.cancelled_at).toBeTruthy();

      // Banned user can't sign back in.
      const client = userClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      expect(data.user).toBeNull();
      expect(error).toBeTruthy();
    });
  });

  describe("duplicate signup", () => {
    let userId = "";
    const email = `dup-${randomUUID()}@inteloop.test`;

    beforeAll(async () => {
      const { data } = await admin.auth.admin.createUser({
        email,
        password: "TestPassword123!",
        email_confirm: true,
      });
      userId = data.user!.id;
    });

    afterAll(async () => {
      if (userId) await admin.auth.admin.deleteUser(userId);
    });

    it("Supabase signals duplicate via empty identities (used by signupAction)", async () => {
      const client = userClient();
      const { data, error } = await client.auth.signUp({
        email,
        password: "AnotherPassword123!",
      });

      // Supabase either errors with a message containing 'already/registered/exists', OR
      // returns a user object with identities=[] to prevent email enumeration. signupAction
      // handles both cases — this test pins down which one the local stack emits.
      if (error) {
        expect(error.message.toLowerCase()).toMatch(/already|registered|exists/);
      } else {
        expect(data.user).toBeTruthy();
        expect(data.user?.identities ?? []).toHaveLength(0);
      }
    });
  });
});
