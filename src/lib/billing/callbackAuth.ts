import "server-only";

import type { NextRequest } from "next/server";

// Mobile money callback authentication.
// Source: docs/inteloop-prd.md §10.9 — "validate the callback against a shared
// secret or IP allowlist (Safaricom and KCB provide fixed callback IP ranges)".
//
// Daraja/KCB cannot send arbitrary auth headers, so the shared secret is
// carried as a `?token=` query param on the registered callback URL. The IP
// allowlist is a comma-separated env list compared against x-forwarded-for.

export type CallbackAuthConfig = {
  secret?: string | null; // expected shared-secret token
  allowedIps?: string[]; // permitted source IPs
};

function clientIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

export function verifyCallbackAuth(request: NextRequest, config: CallbackAuthConfig): boolean {
  const allowedIps = config.allowedIps ?? [];
  const secret = config.secret ?? null;

  // Fail closed when nothing is configured — a callback endpoint must never be
  // wide open (§10.9).
  if (allowedIps.length === 0 && !secret) return false;

  const token = new URL(request.url).searchParams.get("token");
  const secretOk = !!secret && !!token && token === secret;

  const ip = clientIp(request);
  const ipOk = allowedIps.length > 0 && !!ip && allowedIps.includes(ip);

  return secretOk || ipOk;
}

export function parseIpList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
