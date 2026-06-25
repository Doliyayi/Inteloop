import { randomBytes } from "crypto";

// Unambiguous character set: uppercase + digits, no O/0/I/1/L look-alikes.
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateReferralCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes)
    .map((b) => CHARSET[b % CHARSET.length])
    .join("");
}
