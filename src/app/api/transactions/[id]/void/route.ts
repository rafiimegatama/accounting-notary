import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";

// POST /api/transactions/[id]/void — closes the last real Step 19 gap: the
// DDL (Step 11) already has status/voided_at/voided_by/void_reason columns
// specifically so a wrong transaction can be corrected without DELETE
// (blocked by trigger anyway) and without mutating amount/date/direction
// (also blocked by trigger). Until this endpoint existed, those columns
// were unreachable — VOID never actually happened.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const reason: string | undefined = body.reason;
    if (!reason) throw new ApiError("VALIDATION_ERROR", "reason wajib diisi untuk void transaksi.");

    const existing = await prisma.financialTransaction.findUnique({ where: { id: params.id } });
    if (!existing) throw new ApiError("NOT_FOUND", "Transaksi tidak ditemukan.", 404);
    if (existing.status === "VOIDED") throw new ApiError("ALREADY_VOIDED", "Transaksi ini sudah di-void sebelumnya.");

    const activeAllocations = await prisma.paymentAllocation.count({
      where: { status: "ACTIVE", payment: { financialTransactionId: params.id } },
    });
    if (activeAllocations > 0) {
      throw new ApiError(
        "HAS_ACTIVE_ALLOCATIONS",
        "Transaksi ini masih punya alokasi pembayaran aktif — reverse alokasinya dulu sebelum void."
      );
    }

    const voided = await prisma.$transaction(async (tx) => {
      const result = await tx.financialTransaction.update({
        where: { id: params.id },
        data: { status: "VOIDED", voidedAt: new Date(), voidedBy: userId, voidReason: reason },
      });
      await writeAuditLog(tx, {
        entityType: "FINANCIAL_TRANSACTION",
        entityId: params.id,
        action: "VOID",
        userId,
        previousValue: { status: existing.status },
        newValue: { status: "VOIDED" },
        reason,
      });
      return result;
    });

    return apiSuccess(voided, "Transaksi berhasil di-void.");
  });
}
