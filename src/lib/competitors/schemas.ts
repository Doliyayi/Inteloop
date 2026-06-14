import { z } from "zod";

// PRD §7.4: "Please enter a valid URL including https://"
export const websiteUrlSchema = z
  .string()
  .trim()
  .url("Please enter a valid URL including https://")
  .refine((value) => value.startsWith("https://"), {
    message: "Please enter a valid URL including https://",
  });

export const competitorNameSchema = z
  .string()
  .trim()
  .min(2, "Competitor name must be at least 2 characters.")
  .max(100, "Competitor name must be at most 100 characters.");

// Notes is optional. Preprocess maps an empty string to null so the route
// stores SQL NULL rather than ''. A missing key stays undefined, which
// matters for partial updates (see competitorUpdateSchema's refine).
export const competitorNotesSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.string().max(500, "Notes must be at most 500 characters.").nullable().optional(),
);

export const competitorCreateSchema = z.object({
  name: competitorNameSchema,
  website_url: websiteUrlSchema,
  notes: competitorNotesSchema,
});

// Partial update: at least one of name / website_url / notes must be present.
// is_active is not user-mutable through this schema (DELETE handles it).
export const competitorUpdateSchema = z
  .object({
    name: competitorNameSchema.optional(),
    website_url: websiteUrlSchema.optional(),
    notes: competitorNotesSchema,
  })
  .refine(
    (value) =>
      value.name !== undefined || value.website_url !== undefined || value.notes !== undefined,
    { message: "At least one field must be provided." },
  );

export type CompetitorCreateInput = z.infer<typeof competitorCreateSchema>;
export type CompetitorUpdateInput = z.infer<typeof competitorUpdateSchema>;
