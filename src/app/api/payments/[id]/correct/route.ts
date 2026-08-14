import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import {
  assertVoidable,
  voidFinancialTransactionTx,
  resolveInitialReviewStatus,
  createFinancialTransactionTx,
  createClassificationRecordTx,
} from "@/lib/financialTransactionActions";

// POST /api/payments/[id]/correct — Roadmap #2 "Clearer payment correction
// workflow". There is no in-place edit of a payment's amount/date, by
// design (PROJECT_RULES.md constraint 5 / CODING_STANDARD.md §2) — the
// correction path is void-the-wrong-one + create-the-right-one. This is a
// thin convenience endpoint that composes the SAME mutations the app
// already exposes for that path (via the shared helpers in
// financialTransactionActions.ts, extracted from
// transactions/[id]/void/route.ts and transactions/route.ts POST) rather
// than a third implementation of either.
//
// The new transaction is also classified PAYMENT the same way
// transactions/[id]/classify/route.ts does for its PAYMENT branch:
// financial_type = 'PAYMENT' must always be backed by a `payment` row (see
// position.ts's `t.financialType === "PAYMENT" && t.payment` filter) —
// skipping this would silently drop the corrected payment from Position
// and from GET /api/payments.
//
// No schema change: financial_transaction has no "corrects/corrected-by"
// column (and never should — CLAUDE.md §7 constraint 1). The old<->new
// link lives entirely in the audit trail, on BOTH sides, so Transaction
// Trace can discover it from either transaction without a schema change or
// a cross-entity query:
//   - VOID entry   (entityType FINANCIAL_TRANSACTION, entityId = original transaction)
//       newValue: { status: "VOIDED", correctedByTransactionId, correctedByPaymentId }
//   - CREATE entry (entityType FINANCIAL_TRANSACTION, entityId = new transaction)
//       previousValue: { correctsTransactionId, correctsPaymentId }
// Both entries also carry the staff-supplied `reason` verbatim, so "void
// reason" and "the link between old/new" are both queryable straight from
// audit_log per the Roadmap acceptance criteria.
//
// Everything (create + classify-as-payment + void) runs inside one
// prisma.$transaction so the correction either lands completely — old
// voided AND new created — or not at all. No window where the original is
// voided with no replacement.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const { reason, newAmount, newTransactionDate, newDescription } = body;

    if (!reason || !reason.trim()) throw new ApiError("VALIDATION_ERROR", "reason wajib diisi untuk koreksi payment.");
    const numericNewAmount = Number(newAmount);
    if (!newAmount || !Number.isFinite(numericNewAmount) || numericNewAmount <= 0) {
      throw new ApiError("VALIDATION_ERROR", "newAmount wajib diisi dan harus lebih besar dari 0.");
    }

    const payment = await prisma.payment.findUnique({ where: { id: params.id }, include: { transaction: true } });
    if (!payment) throw new ApiError("NOT_FOUND", "Payment tidak ditemukan.", 404);
    const original = payment.transaction;

    // Same pre-transaction rule the plain void endpoint enforces — a
    // payment with active allocations must be reversed first, exactly as
    // if staff had called void directly.
    const existing = await assertVoidable(original.id);
    const reviewStatus = await resolveInitialReviewStatus(original.sourceType);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the corrected transaction — same client/matter/
      //    classification/source as the original, staff-supplied
      //    amount/date/description for what was wrong.
      const corrected = await createFinancialTransactionTx(tx, {
        transactionDate: newTransactionDate ? new Date(newTransactionDate) : original.transactionDate,
        amount: newAmount,
        direction: original.direction,
        description: newDescription || original.description,
        financialType: original.financialType,
        clientId: original.clientId,
        matterId: original.matterId,
        sourceType: original.sourceType,
        sourceReference: original.sourceReference,
        notes: original.notes,
        reviewStatus,
        userId,
        auditPreviousValue: { correctsTransactionId: original.id, correctsPaymentId: params.id },
        auditReason: reason,
      });

      // 2. Back it with a `payment` row (see file header) so it behaves
      //    like any other classified payment — same shared helper
      //    classify/route.ts and POST /api/transactions now use, instead
      //    of a third hand-written copy of this creation logic.
      // Non-null: financialType is the "PAYMENT" literal above, one of the
      // three branches createClassificationRecordTx always creates a row
      // for — only UNCLASSIFIED/OTHER (neither passed here) return null.
      const correctedPayment = (await createClassificationRecordTx(tx, {
        financialTransactionId: corrected.id,
        financialType: "PAYMENT",
        userId,
        notes: `Koreksi dari payment ${params.id}.`,
        auditPreviousValue: { correctsPaymentId: params.id },
        auditReason: reason,
      }))!;

      // 3. Void the original, cross-referencing the replacement.
      await voidFinancialTransactionTx(tx, {
        transactionId: original.id,
        userId,
        reason,
        previousStatus: existing.status,
        extraNewValue: { correctedByTransactionId: corrected.id, correctedByPaymentId: correctedPayment.id },
      });

      return { corrected, correctedPayment };
    });

    return apiSuccess(
      {
        voidedTransactionId: original.id,
        correctedTransactionId: result.corrected.id,
        correctedPaymentId: result.correctedPayment.id,
      },
      "Payment berhasil dikoreksi: transaksi lama di-void, transaksi baru dibuat.",
      201
    );
  });
}
