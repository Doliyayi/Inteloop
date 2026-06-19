import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { generateApiKey, hashApiKey, KEY_PREFIX, parseBearerToken } from "@/lib/apikeys/keys";

describe("generateApiKey (PRD §15.3)", () => {
  it("produces an ilp_ key with a matching sha256 hash and 12-char prefix", () => {
    const k = generateApiKey();
    expect(k.plaintext.startsWith(KEY_PREFIX)).toBe(true);
    expect(k.hash).toBe(createHash("sha256").update(k.plaintext).digest("hex"));
    expect(k.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(k.prefix).toBe(k.plaintext.slice(0, 12));
    expect(k.plaintext.startsWith(k.prefix)).toBe(true);
  });

  it("never collides across generations", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("hashApiKey", () => {
  it("is deterministic", () => {
    expect(hashApiKey("ilp_test")).toBe(hashApiKey("ilp_test"));
    expect(hashApiKey("ilp_a")).not.toBe(hashApiKey("ilp_b"));
  });
});

describe("parseBearerToken", () => {
  it("extracts the token", () => {
    expect(parseBearerToken("Bearer ilp_abc")).toBe("ilp_abc");
    expect(parseBearerToken("bearer ilp_abc")).toBe("ilp_abc");
  });
  it("returns null when absent or malformed", () => {
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken("ilp_abc")).toBeNull();
    expect(parseBearerToken("Bearer ")).toBeNull();
  });
});
