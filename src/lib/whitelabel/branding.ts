import { hasCapability } from "../billing/capabilities";

// Resolves the branding applied to a subscriber's report emails (PRD §13).
// Pure — shared by the report workflows, the email renderers, and tests.
//
// White-label branding applies only when the plan grants the capability
// (Growth/Pro) AND the subscriber has enabled it. A downgrade therefore
// disables white-label immediately (§13.4) with no extra bookkeeping — the
// capability check goes false.

export type ReportBranding = {
  // Product name shown in copy + the email sender display name.
  productName: string;
  // Agency logo shown at the top of the report (null = no logo header).
  logoUrl: string | null;
  // Footer line; empty string renders no footer.
  footerText: string;
  // Whether agency (white-label) branding is in effect.
  whiteLabeled: boolean;
  // Verified custom sender domain, or null to send from Inteloop's domain.
  senderDomain: string | null;
};

export const DEFAULT_BRANDING: ReportBranding = {
  productName: "Inteloop",
  logoUrl: null,
  footerText: "Sent by Inteloop · Competitor intelligence, delivered weekly.",
  whiteLabeled: false,
  senderDomain: null,
};

export type WhiteLabelProfile = {
  plan: string;
  white_label_enabled: boolean;
  white_label_sender_name: string | null;
  white_label_logo_url: string | null;
  white_label_footer_text: string | null;
  white_label_domain: string | null;
  white_label_domain_verified: boolean;
};

export function effectiveBranding(profile: WhiteLabelProfile): ReportBranding {
  if (!hasCapability(profile.plan, "whiteLabel") || !profile.white_label_enabled) {
    return DEFAULT_BRANDING;
  }
  const senderName = profile.white_label_sender_name?.trim();
  // §13.4: only send from the custom domain once DNS is verified.
  const domain =
    profile.white_label_domain_verified && profile.white_label_domain?.trim()
      ? profile.white_label_domain.trim()
      : null;
  return {
    productName: senderName && senderName.length > 0 ? senderName : "Your competitor brief",
    logoUrl: profile.white_label_logo_url?.trim() || null,
    footerText: profile.white_label_footer_text?.trim() ?? "",
    whiteLabeled: true,
    senderDomain: domain,
  };
}

// Builds the email "From" header. With a verified custom domain, send from it
// so no Inteloop appears in the headers (§13.4). Otherwise swap only the
// display name on the base address. Falls back to base when not white-labeled.
export function brandedFromAddress(baseFrom: string, branding: ReportBranding): string {
  if (!branding.whiteLabeled) return baseFrom;
  if (branding.senderDomain) {
    return `${branding.productName} <noreply@${branding.senderDomain}>`;
  }
  const match = baseFrom.match(/<([^>]+)>/);
  const address = match ? match[1] : baseFrom.includes("@") ? baseFrom : null;
  if (!address) return baseFrom;
  return `${branding.productName} <${address}>`;
}
