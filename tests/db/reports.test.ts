import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { getReport, listReports } from "@/lib/reports/history";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!ANON_KEY || !SERVICE_KEY) {
  throw new Error(
    "SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set. Run pnpm db:start.",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdUserIds: string[] = [];

async function createUser(): Promise<{ id: string; client: SupabaseClient }> {
  const email = `reports-${randomUUID()}@inteloop.test`;
  const password = "Reports-Test-1!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("user not created");
  createdUserIds.push(data.user.id);

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

async function insertReport(userId: string, daysAgo: number, subject: string): Promise<string> {
  const created = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("reports")
    .insert({
      user_id: userId,
      report_type: "weekly",
      status: "delivered",
      content: { report_date: "2026-06-15", executive_summary: [], competitors: [] },
      email_subject: subject,
      delivered_at: created,
      created_at: created,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("report not inserted");
  return (data as { id: string }).id;
}

let alice: { id: string; client: SupabaseClient };
let bob: { id: string; client: SupabaseClient };
let bobReportId: string;

beforeAll(async () => {
  alice = await createUser();
  bob = await createUser();
  // Alice: 3 reports, newest = "A0".
  await insertReport(alice.id, 2, "A2");
  await insertReport(alice.id, 1, "A1");
  await insertReport(alice.id, 0, "A0");
  bobReportId = await insertReport(bob.id, 0, "B0");
});

afterAll(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

describe("listReports (PRD §11.1)", () => {
  it("returns only the caller's reports, newest first", async () => {
    const page = await listReports(alice.client);
    expect(page.total).toBe(3);
    expect(page.items.map((r) => r.email_subject)).toEqual(["A0", "A1", "A2"]);
    // List rows must not carry the heavy content column.
    expect("content" in page.items[0]!).toBe(false);
  });

  it("paginates with hasMore / totalPages", async () => {
    const first = await listReports(alice.client, { page: 1, pageSize: 2 });
    expect(first.items.map((r) => r.email_subject)).toEqual(["A0", "A1"]);
    expect(first.hasMore).toBe(true);
    expect(first.totalPages).toBe(2);

    const second = await listReports(alice.client, { page: 2, pageSize: 2 });
    expect(second.items.map((r) => r.email_subject)).toEqual(["A2"]);
    expect(second.hasMore).toBe(false);
  });

  it("does not leak another user's reports (RLS)", async () => {
    const page = await listReports(bob.client);
    expect(page.total).toBe(1);
    expect(page.items[0]!.email_subject).toBe("B0");
  });
});

describe("getReport (PRD §11)", () => {
  it("returns the caller's report including content", async () => {
    const page = await listReports(alice.client, { page: 1, pageSize: 1 });
    const id = page.items[0]!.id;
    const report = await getReport(alice.client, id);
    expect(report).not.toBeNull();
    expect(report!.content).toMatchObject({ report_date: "2026-06-15" });
  });

  it("returns null for another user's report id (RLS → 404)", async () => {
    const report = await getReport(alice.client, bobReportId);
    expect(report).toBeNull();
  });
});
