import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { checkCanAddCompetitor } from "@/lib/competitors/limits";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SERVICE) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set. Run pnpm db:start first.");
}

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function createUserWithPlan(plan: string): Promise<string> {
  const email = `comp-${randomUUID()}@inteloop.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "TestPassword123!",
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("user not created");
  const userId = data.user.id;

  const { error: planError } = await admin.from("profiles").update({ plan }).eq("id", userId);
  if (planError) throw planError;

  return userId;
}

async function seedCompetitors(userId: string, count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({
    user_id: userId,
    name: `Comp ${i + 1}`,
    website_url: `https://comp-${i + 1}.example`,
  }));
  const { error } = await admin.from("competitors").insert(rows);
  if (error) throw error;
}

describe("Competitors — plan limits (PRD §7.3, §7.4)", () => {
  describe("Starter at 3 competitors", () => {
    let userId = "";

    beforeAll(async () => {
      userId = await createUserWithPlan("starter");
      await seedCompetitors(userId, 3);
    });

    afterAll(async () => {
      if (userId) await admin.auth.admin.deleteUser(userId);
    });

    it("blocks the 4th add with the PRD-prescribed Starter copy", async () => {
      const result = await checkCanAddCompetitor(admin, userId);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(422);
        expect(result.error).toBe(
          "Your plan includes up to 3 competitors. Upgrade to Growth to track up to 8.",
        );
      }
    });
  });

  describe("Growth at 8 competitors", () => {
    let userId = "";

    beforeAll(async () => {
      userId = await createUserWithPlan("growth");
      await seedCompetitors(userId, 8);
    });

    afterAll(async () => {
      if (userId) await admin.auth.admin.deleteUser(userId);
    });

    it("blocks the 9th add with the Growth → Pro upgrade copy", async () => {
      const result = await checkCanAddCompetitor(admin, userId);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(
          "Your plan includes up to 8 competitors. Upgrade to Pro to track up to 15.",
        );
      }
    });

    it("allows the 8th-1 add when below the limit", async () => {
      // Remove one to drop below limit.
      const { data: existing } = await admin
        .from("competitors")
        .select("id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (existing) {
        await admin.from("competitors").update({ is_active: false }).eq("id", existing.id);
      }
      const result = await checkCanAddCompetitor(admin, userId);
      expect(result.ok).toBe(true);
    });
  });

  describe("Pro at 15 competitors", () => {
    let userId = "";

    beforeAll(async () => {
      userId = await createUserWithPlan("pro");
      await seedCompetitors(userId, 15);
    });

    afterAll(async () => {
      if (userId) await admin.auth.admin.deleteUser(userId);
    });

    it("blocks the 16th add", async () => {
      const result = await checkCanAddCompetitor(admin, userId);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/Pro plan includes up to 15/);
      }
    });
  });

  describe("Cancelled plan", () => {
    let userId = "";

    beforeAll(async () => {
      userId = await createUserWithPlan("cancelled");
    });

    afterAll(async () => {
      if (userId) await admin.auth.admin.deleteUser(userId);
    });

    it("blocks any add", async () => {
      const result = await checkCanAddCompetitor(admin, userId);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/Reactivate/i);
      }
    });
  });

  describe("Soft delete preserves report_competitors (PRD §7.4)", () => {
    let userId = "";
    let competitorId = "";
    let reportId = "";

    beforeAll(async () => {
      userId = await createUserWithPlan("starter");

      const { data: comp, error: compErr } = await admin
        .from("competitors")
        .insert({
          user_id: userId,
          name: "Legacy",
          website_url: "https://legacy.example",
        })
        .select("id")
        .single();
      if (compErr || !comp) throw compErr ?? new Error("competitor not created");
      competitorId = comp.id;

      const { data: report, error: reportErr } = await admin
        .from("reports")
        .insert({
          user_id: userId,
          report_type: "weekly",
          status: "delivered",
        })
        .select("id")
        .single();
      if (reportErr || !report) throw reportErr ?? new Error("report not created");
      reportId = report.id;

      const { error: linkErr } = await admin.from("report_competitors").insert({
        report_id: reportId,
        competitor_id: competitorId,
      });
      if (linkErr) throw linkErr;
    });

    afterAll(async () => {
      if (userId) await admin.auth.admin.deleteUser(userId);
    });

    it("setting is_active=false on a competitor leaves report_competitors intact", async () => {
      const { error: deleteErr } = await admin
        .from("competitors")
        .update({ is_active: false })
        .eq("id", competitorId);
      expect(deleteErr).toBeNull();

      // Competitor row still exists (soft delete).
      const { data: comp } = await admin
        .from("competitors")
        .select("id, is_active")
        .eq("id", competitorId)
        .single();
      expect(comp?.is_active).toBe(false);

      // Link row still exists — historical report unaffected.
      const { data: link } = await admin
        .from("report_competitors")
        .select("report_id, competitor_id")
        .eq("report_id", reportId)
        .eq("competitor_id", competitorId)
        .maybeSingle();
      expect(link).not.toBeNull();
    });
  });
});
