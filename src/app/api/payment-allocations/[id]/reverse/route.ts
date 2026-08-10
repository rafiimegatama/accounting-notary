import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";
import { recomputeReviewStatus } from "@/lib/exceptionRules";

// POST /api/payment-allocations/[id]/reverse — the correction mechanism for
// a mis-allocated payment (Step 4/11: never delete, mark REVERSED instead).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const reason: string | undefined = body.reason;
    if (!reason) throw new ApiError("VALIDATION_ERROR", "reason wajib diisi untuk reversal.");

    const existing = await prisma.paymentAllocation.findUnique({ where: { id: params.id }, include: { payment: true } });
    if (!existing) throw new ApiError("NOT_FOUND", "Allocation tidak ditemukan.", 404);
    if (existing.status === "REVERSED") throw new ApiError("ALREADY_REVERSED", "Allocation ini sudah di-reverse sebelumnya.");

    const reversed = await prisma.$transaction(async (tx) => {
      const result = await tx.paymentAllocation.update({
        where: { id: params.id },
        data: { status: "REVERSED", reversedAt: new Date(), reversedBy: userId, reversalReason: reason },
      });
      await writeAuditLog(tx, {
        entityType: "PAYMENT_ALLOCATION",
        entityId: params.id,
        action: "REVERSE_ALLOCATION",
        userId,
        previousValue: { status: existing.status },
        newValue: { status: "REVERSED" },
        reason,
      });
      await recomputeReviewStatus(tx, existing.payment.financialTransactionId, userId);
      return result;
    });

    return apiSuccess(reversed, "Alokasi berhasil di-reverse.");
  });
}
