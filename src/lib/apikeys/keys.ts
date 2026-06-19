import "server-only";

import { createHash, randomBytes } from "node:crypto";

// API key generation + hashing (PRD §15.3, CLAUDE.md).
// Plaintext keys are NEVER persisted or logged — only the SHA-256 hash and a
// short prefix are stored. The plaintext is shown to the user exactly once at
// creation.

export const KEY_PREFIX = "ilp_";
// Prefix shown in the dashboard, e.g. "ilp_a3f2c1d9" — the scheme plus the
// first 8 hex chars of the secret.
const VISIBLE_PREFIX_LEN = KEY_PREFIX.length + 8;

export type GeneratedKey = {
  plaintext: string; // returned to the caller once, never stored
  hash: string; // sha256(plaintext) — stored
  prefix: string; // first chars, stored for display
};

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateApiKey(): GeneratedKey {
  // 32 random bytes → 64 hex chars of entropy after the prefix.
  const secret = randomBytes(32).toString("hex");
  const plaintext = `${KEY_PREFIX}${secret}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, VISIBLE_PREFIX_LEN),
  };
}

// Pulls the bearer token out of an Authorization header. Returns null when
// absent or malformed.
export function parseBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}
