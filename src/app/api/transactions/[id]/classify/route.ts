import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";

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
    const { financialType, category, notes } = body;

    const transaction = await prisma.financialTransaction.findUnique({ where: { id: params.id } });
    if (!transaction) throw new ApiError("NOT_FOUND", "Transaksi tidak ditemukan.", 404);

    if (financialType === "DEPOSIT" && transaction.direction !== "IN") {
      throw new ApiError("VALIDATION_ERROR", "DEPOSIT hanya berlaku untuk transaksi arah IN.");
    }
    if (financialType === "PAYMENT" && transaction.direction !== "IN") {
      throw new ApiError("VALIDATION_ERROR", "PAYMENT hanya berlaku untuk transaksi arah IN.");
    }
    if (financialType === "DISBURSEMENT" && transaction.direction !== "OUT") {
      throw new ApiError("VALIDATION_ERROR", "DISBURSEMENT hanya berlaku untuk transaksi arah OUT.");
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.financialTransaction.update({ where: { id: params.id }, data: { financialType } });

      if (financialType === "PAYMENT") {
        const created = await tx.payment.create({ data: { financialTransactionId: params.id, notes: notes ?? null, createdBy: userId } });
        await writeAuditLog(tx, { entityType: "PAYMENT", entityId: created.id, action: "CREATE", userId, newValue: created });
        return created;
      }
      if (financialType === "DEPOSIT") {
        const created = await tx.deposit.create({ data: { financialTransactionId: params.id, notes: notes ?? null, createdBy: userId } });
        await writeAuditLog(tx, { entityType: "DEPOSIT", entityId: created.id, action: "CREATE", userId, newValue: created });
        return created;
      }
      if (financialType === "DISBURSEMENT") {
        const created = await tx.disbursement.create({
          data: { financialTransactionId: params.id, category: category ?? null, notes: notes ?? null, createdBy: userId },
        });
        await writeAuditLog(tx, { entityType: "DISBURSEMENT", entityId: created.id, action: "CREATE", userId, newValue: created });
        return created;
      }
      throw new ApiError("VALIDATION_ERROR", "financialType harus PAYMENT, DEPOSIT, atau DISBURSEMENT.");
    });

    return apiSuccess(result, "Transaksi berhasil diklasifikasikan.", 201);
  });
}
