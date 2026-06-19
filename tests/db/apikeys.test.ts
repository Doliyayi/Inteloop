import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { authenticateApiRequest } from "@/lib/apikeys/auth";
import { createApiKey, listApiKeys, revokeApiKey, MAX_ACTIVE_KEYS } from "@/lib/apikeys/manage";
import { checkRateLimit, RATE_LIMIT_PER_MINUTE } from "@/lib/apikeys/rateLimit";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SERVICE) throw new Error("Run pnpm db:start first.");

const admin: SupabaseClient = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdUserIds: string[] = [];

async function makeUser(plan: string): Promise<string> {
  const email = `apikey-${randomUUID()}@inteloop.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "ApiKey-1!",
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("user not created");
  createdUserIds.push(data.user.id);
  await admin.from("profiles").update({ plan }).eq("id", data.user.id);
  return data.user.id;
}

function bearer(token: string): Request {
  return new Request("https://api.inteloop.com/v1/reports", {
    headers: { authorization: `Bearer ${token}` },
  });
}

afterAll(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

describe("API key management (PRD §15.3)", () => {
  it("creates a key returning plaintext once, and enforces the 5-key cap", async () => {
    const userId = await makeUser("pro");
    for (let i = 0; i < MAX_ACTIVE_KEYS; i++) {
      const r = await createApiKey(admin, userId, `key ${i}`);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.plaintext.startsWith("ilp_")).toBe(true);
    }
    const sixth = await createApiKey(admin, userId, "too many");
    expect(sixth).toMatchObject({ ok: false, status: 422 });
    expect((await listApiKeys(admin, userId)).length).toBe(MAX_ACTIVE_KEYS);
  });
});

describe("authenticateApiRequest (PRD §15.4)", () => {
  it("authenticates a valid Pro key", async () => {
    const userId = await makeUser("pro");
    const created = await createApiKey(admin, userId, null);
    if (!created.ok) throw new Error("setup failed");

    const auth = await authenticateApiRequest(bearer(created.plaintext), admin);
    expect(auth.ok).toBe(true);
    if (auth.ok) expect(auth.userId).toBe(userId);
  });

  it("rejects a missing key with 401", async () => {
    const auth = await authenticateApiRequest(
      new Request("https://api.inteloop.com/v1/reports"),
      admin,
    );
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it("rejects a revoked key with 401 immediately (§15.4)", async () => {
    const userId = await makeUser("pro");
    const created = await createApiKey(admin, userId, null);
    if (!created.ok) throw new Error("setup failed");
    await revokeApiKey(admin, userId, created.key.id);

    const auth = await authenticateApiRequest(bearer(created.plaintext), admin);
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it("rejects a non-Pro plan with 403 (§15.4)", async () => {
    const userId = await makeUser("growth");
    const created = await createApiKey(admin, userId, null);
    if (!created.ok) throw new Error("setup failed");

    const auth = await authenticateApiRequest(bearer(created.plaintext), admin);
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.response.status).toBe(403);
      const body = (await auth.response.json()) as { error: string };
      expect(body.error).toBe("API access is available on the Pro plan.");
    }
  });
});

describe("checkRateLimit (PRD §15.2)", () => {
  it("allows up to the limit then returns retryAfter", async () => {
    const userId = await makeUser("pro");
    const created = await createApiKey(admin, userId, null);
    if (!created.ok) throw new Error("setup failed");
    const keyId = created.key.id;
    const now = Date.now();

    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      const r = await checkRateLimit(admin, keyId, now);
      expect(r.ok).toBe(true);
    }
    const over = await checkRateLimit(admin, keyId, now);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.retryAfter).toBeGreaterThan(0);
  });
});
