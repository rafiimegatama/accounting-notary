// TypeScript-level mirror of the CHECK constraints defined in
// ddl_notary_financial_control.sql. The DB is the authoritative source
// of truth (Prisma stores these columns as plain String) — these types
// exist purely so application code gets compile-time checking instead
// of stringly-typed values scattered around route handlers.

export const SOURCE_TYPES = [
  "INTERNAL_SYSTEM", "EXCEL", "BANK_STATEMENT", "WORD", "WHATSAPP",
  "PDF", "IMAGE", "MANUAL", "OTHER", "SOURCE_PENDING",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const TRANSACTION_DIRECTIONS = ["IN", "OUT"] as const;
export type TransactionDirection = (typeof TRANSACTION_DIRECTIONS)[number];

export const FINANCIAL_TYPES = ["UNCLASSIFIED", "PAYMENT", "DEPOSIT", "DISBURSEMENT", "OTHER"] as const;
export type FinancialType = (typeof FINANCIAL_TYPES)[number];

export const REVIEW_STATUSES = ["NORMAL", "WARNING", "REVIEW_REQUIRED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const TRANSACTION_STATUSES = ["ACTIVE", "VOIDED"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const INVOICE_STATUSES = ["DRAFT", "ISSUED", "VOID"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const COST_DETAIL_STATUSES = ["ACTIVE", "VOID"] as const;
export type CostDetailStatus = (typeof COST_DETAIL_STATUSES)[number];

export const ALLOCATION_TYPES = ["INVOICE_PAYMENT", "DEPOSIT_TOPUP", "OTHER"] as const;
export type AllocationType = (typeof ALLOCATION_TYPES)[number];

export const ALLOCATION_STATUSES = ["ACTIVE", "REVERSED"] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

export const AUDIT_ENTITY_TYPES = [
  "CLIENT", "MATTER", "FINANCIAL_TRANSACTION", "COST_DETAIL", "INVOICE",
  "PAYMENT", "PAYMENT_ALLOCATION", "DEPOSIT", "DISBURSEMENT", "FINANCIAL_ATTACHMENT",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTIONS = [
  "CREATE", "UPDATE", "LINK", "RELINK", "UNLINK", "ALLOCATE",
  "REVERSE_ALLOCATION", "STATUS_CHANGE", "ATTACH", "VOID", "ADJUSTMENT",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

import { ApiError } from "./apiResponse";

export function assertOneOf<T extends readonly string[]>(
  value: string,
  allowed: T,
  fieldName: string
): asserts value is T[number] {
  if (!allowed.includes(value as T[number])) {
    throw new ApiError("VALIDATION_ERROR", `${fieldName} harus salah satu dari: ${allowed.join(", ")}. Diterima: ${value}`);
  }
}
