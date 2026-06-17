import { z } from "zod";

// White-label configuration input (PRD §13.2). Logo is a URL for now; file
// upload to Storage is a follow-up milestone.

const optionalTrimmed = (max: number, label: string) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().max(max, `${label} must be at most ${max} characters.`).nullable(),
  );

export const whiteLabelUpdateSchema = z.object({
  enabled: z.boolean(),
  sender_name: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z
      .string()
      .min(2, "Sender name must be at least 2 characters.")
      .max(50, "Sender name must be at most 50 characters.")
      .nullable(),
  ),
  logo_url: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().url("Enter a valid logo URL (https://…).").nullable(),
  ),
  footer_text: optionalTrimmed(200, "Footer text"),
});

export type WhiteLabelUpdateInput = z.infer<typeof whiteLabelUpdateSchema>;
