import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { writeAuditLog } from "./audit";
import { ApiError } from "./apiResponse";

type Tx = Prisma.TransactionClient | PrismaClient;

// Shared by POST /api/transactions/[id]/void and POST /api/payments/[id]/correct
// (Roadmap #2 — "Clearer payment correction workflow") so both endpoints apply
// the exact same voidability rule instead of two implementations that could
// silently drift apart. Runs against the top-level `prisma` client (not a
// `tx`) because it's a pre-transaction check — mirrors how the original void
// route validated before it ever opened a transaction.
//
// Security fix (HIGH, concurrency race): this is a fast, friendly
// pre-check only — it cannot by itself stop two concurrent void/correct
// requests for the same transaction from both reading status ACTIVE before
// either has committed, and both proceeding. It exists so the ordinary,
// non-concurrent case gets a clear error here instead of always falling
// through to the transaction. The actual guarantee against the race lives
// in voidFinancialTransactionTx's conditional update below.
export async function assertVoidable(transactionId: string) {
  const existing = await prisma.financialTransaction.findUnique({ where: { id: transactionId } });
  if (!existing) throw new ApiError("NOT_FOUND", "Transaksi tidak ditemukan.", 404);
  if (existing.status === "VOIDED") throw new ApiError("ALREADY_VOIDED", "Transaksi ini sudah di-void sebelumnya.");

  const activeAllocations = await prisma.paymentAllocation.count({
    where: { status: "ACTIVE", payment: { financialTransactionId: transactionId } },
  });
  if (activeAllocations > 0) {
    throw new ApiError(
      "HAS_ACTIVE_ALLOCATIONS",
      "Transaksi ini masih punya alokasi pembayaran aktif — reverse alokasinya dulu sebelum void."
    );
  }
  return existing;
}

// The actual status-transition + audit write, run inside the caller's own
// `tx` (CODING_STANDARD.md §1: mutation and its audit entry share one tx).
// `extraNewValue` lets a caller (the correction endpoint) attach extra
// structured fields — e.g. the replacement transaction's id — onto the VOID
// audit entry without a second, divergent void code path.
//
// Security fix (HIGH, concurrency race): the conditional `updateMany`
// (WHERE status = ACTIVE), not assertVoidable's earlier read, is what
// actually prevents double-voiding. Two requests racing to void the same
// transaction can both pass assertVoidable's pre-check (both read ACTIVE
// before either transaction has committed), but Postgres serializes
// concurrent UPDATEs against the same row: whichever transaction commits
// first flips the row to VOIDED, and the other's UPDATE — blocked until
// the first commits, then re-evaluated against the now-current row under
// READ COMMITTED — matches zero rows. `count === 0` means this call lost
// the race (or simply arrived after an earlier, non-concurrent void); it
// gets the exact same ALREADY_VOIDED error assertVoidable throws in the
// ordinary case, so callers can't distinguish the two situations and the
// API contract is unchanged.
export async function voidFinancialTransactionTx(
  tx: Tx,
  params: {
    transactionId: string;
    userId: string;
    reason: string;
    previousStatus: string;
    extraNewValue?: Record<string, unknown>;
  }
) {
  const { count } = await tx.financialTransaction.updateMany({
    where: { id: params.transactionId, status: "ACTIVE" },
    data: { status: "VOIDED", voidedAt: new Date(), voidedBy: params.userId, voidReason: params.reason },
  });
  if (count === 0) {
    throw new ApiError("ALREADY_VOIDED", "Transaksi ini sudah di-void sebelumnya.");
  }
  const voided = await tx.financialTransaction.findUniqueOrThrow({ where: { id: params.transactionId } });
  await writeAuditLog(tx, {
    entityType: "FINANCIAL_TRANSACTION",
    entityId: params.transactionId,
    action: "VOID",
    userId: params.userId,
    previousValue: { status: params.previousStatus },
    newValue: { status: "VOIDED", ...params.extraNewValue },
    reason: params.reason,
  });
  return voided;
}

// Mirrors the `warn_on_missing_source` review-status rule POST
// /api/transactions already applies at creation time (Step 9 rule table) —
// a corrected transaction is a genuinely new financial fact and goes
// through the same initial-review-status computation as any manually
// entered one, not a hardcoded "NORMAL".
export async function resolveInitialReviewStatus(sourceType: string): Promise<"NORMAL" | "WARNING"> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "warn_on_missing_source" } });
  const warnOnMissingSource = (setting?.value ?? "true") === "true";
  return sourceType === "SOURCE_PENDING" && warnOnMissingSource ? "WARNING" : "NORMAL";
}

// The actual insert + audit write, run inside the caller's own `tx`. Shared
// by POST /api/transactions and POST /api/payments/[id]/correct so a
// corrected transaction is created through the exact same path as a
// manually-entered one — same columns written, same CREATE audit shape.
export async function createFinancialTransactionTx(
  tx: Tx,
  params: {
    transactionDate: Date;
    amount: number | string | Prisma.Decimal;
    direction: string;
    description: string;
    financialType: string;
    clientId: string | null;
    matterId: string | null;
    sourceType: string;
    sourceReference: string | null;
    notes: string | null;
    reviewStatus: string;
    userId: string;
    auditPreviousValue?: unknown;
    auditReason?: string;
  }
) {
  const created = await tx.financialTransaction.create({
    data: {
      transactionDate: params.transactionDate,
      amount: params.amount,
      direction: params.direction,
      description: params.description,
      financialType: params.financialType,
      clientId: params.clientId,
      matterId: params.matterId,
      sourceType: params.sourceType,
      sourceReference: params.sourceReference,
      reviewStatus: params.reviewStatus,
      notes: params.notes,
      createdBy: params.userId,
    },
  });
  await writeAuditLog(tx, {
    entityType: "FINANCIAL_TRANSACTION",
    entityId: created.id,
    action: "CREATE",
    userId: params.userId,
    previousValue: params.auditPreviousValue,
    newValue: created,
    reason: params.auditReason,
  });
  return created;
}

// financialType must match a transaction's direction — PAYMENT/DEPOSIT
// only for IN, DISBURSEMENT only for OUT. Shared so every entry point that
// can set financialType (classify, and now transaction creation/
// correction) enforces the exact same rule instead of drifting.
export function assertFinancialTypeDirection(financialType: string, direction: string) {
  if (financialType === "DEPOSIT" && direction !== "IN") {
    throw new ApiError("VALIDATION_ERROR", "DEPOSIT hanya berlaku untuk transaksi arah IN.");
  }
  if (financialType === "PAYMENT" && direction !== "IN") {
    throw new ApiError("VALIDATION_ERROR", "PAYMENT hanya berlaku untuk transaksi arah IN.");
  }
  if (financialType === "DISBURSEMENT" && direction !== "OUT") {
    throw new ApiError("VALIDATION_ERROR", "DISBURSEMENT hanya berlaku untuk transaksi arah OUT.");
  }
}

// Bug fix: a transaction whose financial_type is PAYMENT/DEPOSIT/
// DISBURSEMENT must always be backed by the matching child row (Payment/
// Deposit/Disbursement) — position.ts, the Payments list, and allocation
// all key off that child row's existence, not the financial_type label
// alone. This was previously ONLY done by
// transactions/[id]/classify/route.ts and, separately (and only for
// PAYMENT), hand-duplicated inside payments/[id]/correct/route.ts.
// POST /api/transactions never got the same treatment: creating a
// transaction with financialType=PAYMENT set directly at creation time
// (rather than left UNCLASSIFIED and classified afterward) produced a
// transaction that LOOKED classified but had no Payment row — invisible
// to /payments, unallocatable, and with no way to fix it from the UI
// (the classify panel only renders when financialType===UNCLASSIFIED).
// Extracted here so all three call sites (classify, correct, create) stay
// in sync instead of a third slightly-diverging copy.
export async function createClassificationRecordTx(
  tx: Tx,
  params: {
    financialTransactionId: string;
    financialType: string;
    userId: string;
    notes?: string | null;
    category?: string | null;
    bankAccountId?: string | null;
    auditPreviousValue?: unknown;
    auditReason?: string;
  }
) {
  if (params.financialType === "PAYMENT") {
    const created = await tx.payment.create({
      data: { financialTransactionId: params.financialTransactionId, notes: params.notes ?? null, createdBy: params.userId },
    });
    await writeAuditLog(tx, {
      entityType: "PAYMENT", entityId: created.id, action: "CREATE", userId: params.userId,
      newValue: created, previousValue: params.auditPreviousValue, reason: params.auditReason,
    });
    return created;
  }
  if (params.financialType === "DEPOSIT") {
    const created = await tx.deposit.create({
      data: { financialTransactionId: params.financialTransactionId, notes: params.notes ?? null, createdBy: params.userId },
    });
    await writeAuditLog(tx, {
      entityType: "DEPOSIT", entityId: created.id, action: "CREATE", userId: params.userId,
      newValue: created, previousValue: params.auditPreviousValue, reason: params.auditReason,
    });
    return created;
  }
  if (params.financialType === "DISBURSEMENT") {
    const created = await tx.disbursement.create({
      data: {
        financialTransactionId: params.financialTransactionId,
        category: params.category ?? null,
        bankAccountId: params.bankAccountId ?? null,
        notes: params.notes ?? null,
        createdBy: params.userId,
      },
    });
    await writeAuditLog(tx, {
      entityType: "DISBURSEMENT", entityId: created.id, action: "CREATE", userId: params.userId,
      newValue: created, previousValue: params.auditPreviousValue, reason: params.auditReason,
    });
    return created;
  }
  return null; // UNCLASSIFIED / OTHER — no child record for these.
}
