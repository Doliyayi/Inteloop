import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address.");

export const passwordSchema = z.string().min(8, "Password must be at least 8 characters.");

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  // Optional referral code captured from ?ref= query param.
  ref_code: z
    .string()
    .regex(/^[A-Z2-9]{8}$/)
    .optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const updatePasswordSchema = z.object({
  password: passwordSchema,
});

export const updateEmailSchema = z.object({
  email: emailSchema,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
