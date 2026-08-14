import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { assertFinancialTypeDirection, createClassificationRecordTx } from "@/lib/financialTransactionActions";

// POST /api/transactions/[id]/classify — the "PAYMENT = transaksi yang
// telah dikenali sebagai pembayaran" step (Step 3/4): creates the thin
// Payment/Deposit/Disbursement row backing this transaction so it can
// then be allocated (payment) or shown in the deposit/disbursement ledger.
// Idempotent by construction: financial_transaction_id is UNIQUE on all
// three child tables, so re-classifying an already-classified transaction
// fails with a clear error instead of creating a duplicate.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();
    const { financialType, category, notes, bankAccountId } = body;

    const transaction = await prisma.financialTransaction.findUnique({ where: { id: params.id } });
    if (!transaction) throw new ApiError("NOT_FOUND", "Transaksi tidak ditemukan.", 404);

    if (!["PAYMENT", "DEPOSIT", "DISBURSEMENT"].includes(financialType)) {
      throw new ApiError("VALIDATION_ERROR", "financialType harus PAYMENT, DEPOSIT, atau DISBURSEMENT.");
    }
    assertFinancialTypeDirection(financialType, transaction.direction);

    const result = await prisma.$transaction(async (tx) => {
      await tx.financialTransaction.update({ where: { id: params.id }, data: { financialType } });
      // Set bankAccountId once, here, at classify time — no PATCH/edit
      // route exists for Disbursement (see
      // src/app/api/bank-accounts/[id]/route.ts comment). A wrong
      // bankAccountId is corrected the same way a wrong amount/category
      // is: void this transaction, re-classify a new one.
      return createClassificationRecordTx(tx, {
        financialTransactionId: params.id,
        financialType,
        userId,
        notes,
        category,
        bankAccountId,
      });
    });

    return apiSuccess(result, "Transaksi berhasil diklasifikasikan.", 201);
  });
}
