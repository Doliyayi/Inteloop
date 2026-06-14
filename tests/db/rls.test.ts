import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!ANON_KEY || !SERVICE_KEY) {
  throw new Error(
    "SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set. " +
      "Run `pnpm db:start`, then copy the values from `supabase status` " +
      "into .env.test.local (or export them in your shell).",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type TestUser = {
  id: string;
  email: string;
  client: SupabaseClient;
};

async function createTestUser(): Promise<TestUser> {
  const email = `rls-test-${randomUUID()}@inteloop.test`;
  const password = "Rls-Test-Password-1!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("user not created");

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  return { id: data.user.id, email, client };
}

async function deleteTestUser(id: string) {
  await admin.auth.admin.deleteUser(id);
}

describe("RLS", () => {
  let alice: TestUser;
  let bob: TestUser;
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  beforeAll(async () => {
    alice = await createTestUser();
    bob = await createTestUser();
  });

  afterAll(async () => {
    if (alice) await deleteTestUser(alice.id);
    if (bob) await deleteTestUser(bob.id);
  });

  describe("profiles", () => {
    it("user reads only their own profile", async () => {
      const { data, error } = await alice.client.from("profiles").select("id, email");
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0]!.id).toBe(alice.id);
    });

    it("bob cannot read alice's profile", async () => {
      const { data, error } = await bob.client.from("profiles").select("id").eq("id", alice.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("user can update their own profile", async () => {
      const { error } = await alice.client
        .from("profiles")
        .update({ company_name: "Acme" })
        .eq("id", alice.id);
      expect(error).toBeNull();
      const { data } = await admin
        .from("profiles")
        .select("company_name")
        .eq("id", alice.id)
        .single();
      expect(data?.company_name).toBe("Acme");
    });

    it("bob cannot update alice's profile", async () => {
      await bob.client.from("profiles").update({ company_name: "PWNED" }).eq("id", alice.id);
      const { data } = await admin
        .from("profiles")
        .select("company_name")
        .eq("id", alice.id)
        .single();
      expect(data?.company_name).not.toBe("PWNED");
    });

    it("anonymous cannot read profiles", async () => {
      const { data } = await anon.from("profiles").select("id");
      expect(data).toEqual([]);
    });
  });

  describe("competitors", () => {
    let aliceCompetitorId: string;

    beforeAll(async () => {
      const { data, error } = await alice.client
        .from("competitors")
        .insert({ user_id: alice.id, name: "Stripe", website_url: "https://stripe.com" })
        .select("id")
        .single();
      expect(error).toBeNull();
      aliceCompetitorId = data!.id;
    });

    it("bob cannot insert a competitor for alice", async () => {
      const { error } = await bob.client
        .from("competitors")
        .insert({ user_id: alice.id, name: "Evil", website_url: "https://evil.com" });
      expect(error).not.toBeNull();
    });

    it("bob cannot read alice's competitors", async () => {
      const { data } = await bob.client
        .from("competitors")
        .select("id")
        .eq("id", aliceCompetitorId);
      expect(data).toEqual([]);
    });

    it("bob cannot update alice's competitor", async () => {
      await bob.client
        .from("competitors")
        .update({ name: "Stripe Compromised" })
        .eq("id", aliceCompetitorId);
      const { data } = await admin
        .from("competitors")
        .select("name")
        .eq("id", aliceCompetitorId)
        .single();
      expect(data?.name).toBe("Stripe");
    });

    it("bob cannot delete alice's competitor", async () => {
      await bob.client.from("competitors").delete().eq("id", aliceCompetitorId);
      const { data } = await admin.from("competitors").select("id").eq("id", aliceCompetitorId);
      expect(data).toHaveLength(1);
    });

    it("anonymous cannot read competitors", async () => {
      const { data } = await anon.from("competitors").select("id");
      expect(data).toEqual([]);
    });
  });

  describe("reports", () => {
    let aliceReportId: string;

    beforeAll(async () => {
      const { data, error } = await admin
        .from("reports")
        .insert({ user_id: alice.id, report_type: "welcome", status: "delivered" })
        .select("id")
        .single();
      expect(error).toBeNull();
      aliceReportId = data!.id;
    });

    it("alice reads her own report", async () => {
      const { data } = await alice.client.from("reports").select("id").eq("id", aliceReportId);
      expect(data).toHaveLength(1);
    });

    it("bob cannot read alice's report", async () => {
      const { data } = await bob.client.from("reports").select("id").eq("id", aliceReportId);
      expect(data).toEqual([]);
    });

    it("user cannot insert a report (server-only)", async () => {
      const { error } = await alice.client
        .from("reports")
        .insert({ user_id: alice.id, report_type: "welcome" });
      expect(error).not.toBeNull();
    });
  });

  describe("report_errors (operator-only)", () => {
    beforeAll(async () => {
      await admin.from("report_errors").insert({
        user_id: alice.id,
        report_type: "weekly",
        error_message: "test failure",
      });
    });

    it("authenticated user cannot read report_errors", async () => {
      const { data } = await alice.client.from("report_errors").select("id");
      expect(data).toEqual([]);
    });

    it("service role can read report_errors", async () => {
      const { data, error } = await admin.from("report_errors").select("id");
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    });
  });

  describe("stripe_events (operator-only)", () => {
    it("authenticated user cannot read stripe_events", async () => {
      const { data } = await alice.client.from("stripe_events").select("event_id");
      expect(data).toEqual([]);
    });

    it("authenticated user cannot insert stripe_events", async () => {
      const { error } = await alice.client
        .from("stripe_events")
        .insert({ event_id: "evt_test_1", event_type: "checkout.session.completed" });
      expect(error).not.toBeNull();
    });
  });

  describe("battlecards", () => {
    let aliceBattlecardId: string;
    let aliceCompetitorId: string;

    beforeAll(async () => {
      const { data: comp, error: compErr } = await alice.client
        .from("competitors")
        .insert({
          user_id: alice.id,
          name: "Acme",
          website_url: "https://acme.example",
        })
        .select("id")
        .single();
      expect(compErr).toBeNull();
      aliceCompetitorId = comp!.id;

      const { data, error } = await admin
        .from("battlecards")
        .insert({
          user_id: alice.id,
          competitor_id: aliceCompetitorId,
          content: { competitor_name: "Acme" },
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      aliceBattlecardId = data!.id;
    });

    it("alice reads her battlecard", async () => {
      const { data } = await alice.client
        .from("battlecards")
        .select("id")
        .eq("id", aliceBattlecardId);
      expect(data).toHaveLength(1);
    });

    it("bob cannot read alice's battlecard", async () => {
      const { data } = await bob.client
        .from("battlecards")
        .select("id")
        .eq("id", aliceBattlecardId);
      expect(data).toEqual([]);
    });

    it("authenticated user cannot insert (server-only)", async () => {
      const { error } = await alice.client.from("battlecards").insert({
        user_id: alice.id,
        competitor_id: aliceCompetitorId,
        content: {},
      });
      expect(error).not.toBeNull();
    });

    it("alice can delete her own battlecard", async () => {
      const { error } = await alice.client.from("battlecards").delete().eq("id", aliceBattlecardId);
      expect(error).toBeNull();
    });
  });

  describe("api_keys", () => {
    it("alice creates a key, bob cannot see it", async () => {
      const { data: created, error: insErr } = await alice.client
        .from("api_keys")
        .insert({
          user_id: alice.id,
          key_hash: `hash-${randomUUID()}`,
          key_prefix: "ilp_test",
          label: "test",
        })
        .select("id")
        .single();
      expect(insErr).toBeNull();
      expect(created).toBeTruthy();

      const { data: bobView } = await bob.client
        .from("api_keys")
        .select("id")
        .eq("id", created!.id);
      expect(bobView).toEqual([]);
    });

    it("bob cannot insert a key for alice", async () => {
      const { error } = await bob.client.from("api_keys").insert({
        user_id: alice.id,
        key_hash: `hash-${randomUUID()}`,
        key_prefix: "ilp_evil",
      });
      expect(error).not.toBeNull();
    });

    it("anonymous cannot read api_keys", async () => {
      const { data } = await anon.from("api_keys").select("id");
      expect(data).toEqual([]);
    });
  });
});
