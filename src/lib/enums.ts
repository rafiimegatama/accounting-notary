// TypeScript-level mirror of the CHECK constraints defined in
// ddl_notary_financial_control.sql. The DB is the authoritative source
// of truth (Prisma stores these columns as plain String) — these types
// exist purely so application code gets compile-time checking instead
// of stringly-typed values scattered around route handlers.

import { ApiError } from "./apiResponse";

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
  "BANK_ACCOUNT",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTIONS = [
  "CREATE", "UPDATE", "LINK", "RELINK", "UNLINK", "ALLOCATE",
  "REVERSE_ALLOCATION", "STATUS_CHANGE", "ATTACH", "VOID", "ADJUSTMENT",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// Unlike the arrays above, this is NOT a DB-enforced enum — cost_detail.category
// stays free text on purpose (per CLAUDE.md §3, source formats/taxonomy aren't
// validated yet). This is only a deterministic, advisory typeahead vocabulary
// to cut down on repetitive typing/typos for the categories staff use most —
// see docs/ROADMAP.md "predefined value autocomplete." Staff can always type a
// value that isn't in this list; extend it here as real usage reveals more
// common categories, don't build a master-data admin screen for it.
export const COST_CATEGORY_SUGGESTIONS = [
  "BPHTB", "PNBP", "Honorarium", "Materai", "Pengecekan Sertifikat",
  "Pajak", "Biaya Administrasi", "Lainnya",
] as const;

// Prefix match, case-insensitive — deliberately simple (no fuzzy/substring
// matching) so suggestions stay predictable: "BP" only ever suggests things
// that start with "BP", never a coincidental substring match elsewhere in
// the word.
export function matchCostCategorySuggestions(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return COST_CATEGORY_SUGGESTIONS.filter((c) => c.toLowerCase().startsWith(q));
}

export function assertOneOf<T extends readonly string[]>(
  value: string,
  allowed: T,
  fieldName: string
): asserts value is T[number] {
  if (!allowed.includes(value as T[number])) {
    throw new ApiError("VALIDATION_ERROR", `${fieldName} harus salah satu dari: ${allowed.join(", ")}. Diterima: ${value}`);
  }
}
