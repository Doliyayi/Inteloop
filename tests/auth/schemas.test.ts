import { describe, it, expect } from "vitest";

import {
  emailSchema,
  passwordSchema,
  signupSchema,
  loginSchema,
  updatePasswordSchema,
  updateEmailSchema,
} from "@/lib/auth/schemas";

describe("emailSchema", () => {
  it("accepts a valid email", () => {
    expect(emailSchema.safeParse("user@example.com").success).toBe(true);
  });

  it("rejects an invalid format with the PRD-prescribed message", () => {
    const result = emailSchema.safeParse("not-an-email");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toMatch(/valid email/i);
    }
  });

  it("trims and lowercases", () => {
    const result = emailSchema.safeParse("  User@Example.COM  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("user@example.com");
  });
});

describe("passwordSchema", () => {
  it("rejects passwords shorter than 8 chars", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
  });

  it("accepts 8+ char passwords", () => {
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
  });
});

describe("signupSchema", () => {
  it("requires both email and password", () => {
    expect(signupSchema.safeParse({}).success).toBe(false);
    expect(signupSchema.safeParse({ email: "u@x.com" }).success).toBe(false);
    expect(signupSchema.safeParse({ password: "12345678" }).success).toBe(false);
  });

  it("accepts a valid combination", () => {
    expect(signupSchema.safeParse({ email: "u@x.com", password: "12345678" }).success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "u@x.com", password: "" }).success).toBe(false);
  });

  it("accepts any non-empty password (no min length on login)", () => {
    expect(loginSchema.safeParse({ email: "u@x.com", password: "x" }).success).toBe(true);
  });
});

describe("updatePasswordSchema", () => {
  it("enforces 8 char minimum", () => {
    expect(updatePasswordSchema.safeParse({ password: "short" }).success).toBe(false);
    expect(updatePasswordSchema.safeParse({ password: "12345678" }).success).toBe(true);
  });
});

describe("updateEmailSchema", () => {
  it("enforces a valid email", () => {
    expect(updateEmailSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(updateEmailSchema.safeParse({ email: "new@example.com" }).success).toBe(true);
  });
});
