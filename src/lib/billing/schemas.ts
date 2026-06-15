import { z } from "zod";

// Request + callback validation for billing.
// Source: docs/inteloop-prd.md §10.5–10.9. Every route input and every webhook
// payload is parsed here before crossing into business logic (CLAUDE.md: "No
// untrusted data crosses a function boundary").

export const planSchema = z.enum(["starter", "growth", "pro"]);
export const intervalSchema = z.enum(["monthly", "annual"]);
// Mobile money is monthly-only (no annual KES price; renewals run monthly).
export const mobileIntervalSchema = z.literal("monthly");

// --- Stripe checkout ---------------------------------------------------------

export const checkoutRequestSchema = z.object({
  plan: planSchema,
  interval: intervalSchema.default("monthly"),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

// --- Mpesa initiation --------------------------------------------------------

// Accept common local formats; the adapter normalises to 2547XXXXXXXX.
const phoneSchema = z
  .string()
  .trim()
  .regex(/^(?:\+?254|0)?(?:7|1)\d{8}$/, "Enter a valid Safaricom phone number.");

export const mpesaInitiateSchema = z.object({
  plan: planSchema,
  interval: mobileIntervalSchema.default("monthly"),
  phone: phoneSchema,
});
export type MpesaInitiateRequest = z.infer<typeof mpesaInitiateSchema>;

// --- KCB initiation ----------------------------------------------------------

export const kcbInitiateSchema = z.object({
  plan: planSchema,
  interval: mobileIntervalSchema.default("monthly"),
});
export type KcbInitiateRequest = z.infer<typeof kcbInitiateSchema>;

// --- Mpesa STK Push callback (Daraja) ---------------------------------------
// §10.9 payload shape. CallbackMetadata is only present on success.

const callbackItemSchema = z.object({
  Name: z.string(),
  Value: z.union([z.string(), z.number()]).optional(),
});

const stkCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.union([z.number(), z.string()]),
      ResultDesc: z.string().optional(),
      CallbackMetadata: z.object({ Item: z.array(callbackItemSchema) }).optional(),
    }),
  }),
});

export type ParsedMpesaCallback = {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  amount: number | null;
  receipt: string | null;
  phone: string | null;
};

export function parseMpesaCallback(input: unknown): ParsedMpesaCallback | null {
  const parsed = stkCallbackSchema.safeParse(input);
  if (!parsed.success) return null;
  const cb = parsed.data.Body.stkCallback;

  const items = cb.CallbackMetadata?.Item ?? [];
  const find = (name: string) => items.find((i) => i.Name === name)?.Value;
  const amountRaw = find("Amount");
  const receiptRaw = find("MpesaReceiptNumber");
  const phoneRaw = find("PhoneNumber");

  return {
    merchantRequestId: cb.MerchantRequestID,
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: Number(cb.ResultCode),
    resultDesc: cb.ResultDesc ?? "",
    amount: amountRaw !== undefined ? Number(amountRaw) : null,
    receipt: receiptRaw !== undefined ? String(receiptRaw) : null,
    phone: phoneRaw !== undefined ? String(phoneRaw) : null,
  };
}

// --- KCB callback (UNVERIFIED shape — see integrations/kcb.ts) ---------------

const kcbCallbackSchema = z.object({
  transactionReference: z.string(),
  // KCB result codes are strings/numbers depending on product; treat "0"/0 and
  // an explicit status of "SUCCESS" as success in the processor.
  resultCode: z.union([z.number(), z.string()]).optional(),
  status: z.string().optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  accountReference: z.string().optional(),
  description: z.string().optional(),
});

export type ParsedKcbCallback = {
  transactionReference: string;
  resultCode: string | null;
  status: string | null;
  amount: number | null;
  accountReference: string | null;
  description: string | null;
};

export function parseKcbCallback(input: unknown): ParsedKcbCallback | null {
  const parsed = kcbCallbackSchema.safeParse(input);
  if (!parsed.success) return null;
  const d = parsed.data;
  return {
    transactionReference: d.transactionReference,
    resultCode: d.resultCode !== undefined ? String(d.resultCode) : null,
    status: d.status ?? null,
    amount: d.amount !== undefined ? Number(d.amount) : null,
    accountReference: d.accountReference ?? null,
    description: d.description ?? null,
  };
}
