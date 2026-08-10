import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";
import { assertOneOf, REVIEW_STATUSES, SOURCE_TYPES } from "@/lib/enums";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const transaction = await prisma.financialTransaction.findUnique({
      where: { id: params.id },
      include: {
        client: true,
        matter: true,
        payment: { include: { allocations: true } },
        deposit: true,
        disbursement: true,
        attachments: true,
      },
    });
    if (!transaction) throw new ApiError("NOT_FOUND", "Transaksi tidak ditemukan.", 404);
    return apiSuccess(transaction);
  });
}

// PATCH allows ONLY metadata fields (notes, source_type, source_reference).
// amount/transaction_date/direction/client_id/matter_id are excluded here
// by design — the first three are DB-immutable (Step 11 trigger), the last
// two go through POST /link so every relationship change gets its own
// audit LINK/RELINK/UNLINK action instead of a generic UPDATE.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();
    const { notes, sourceType, sourceReference, reviewStatus, reason } = body;

    if (sourceType) assertOneOf(sourceType, SOURCE_TYPES, "sourceType");
    // Manual review-status override — e.g. staff flagging a suspected
    // duplicate (Step 9: no automatic duplicate detection, manual only).
    // A reason is required here specifically because this overrides an
    // otherwise system-computed value, unlike notes/source which are
    // plain metadata.
    if (reviewStatus) {
      assertOneOf(reviewStatus, REVIEW_STATUSES, "reviewStatus");
      if (!reason) throw new ApiError("VALIDATION_ERROR", "reason wajib diisi saat mengubah reviewStatus secara manual.");
    }

    const existing = await prisma.financialTransaction.findUnique({ where: { id: params.id } });
    if (!existing) throw new ApiError("NOT_FOUND", "Transaksi tidak ditemukan.", 404);

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.financialTransaction.update({
        where: { id: params.id },
        data: {
          notes: notes ?? existing.notes,
          sourceType: sourceType ?? existing.sourceType,
          sourceReference: sourceReference ?? existing.sourceReference,
          reviewStatus: reviewStatus ?? existing.reviewStatus,
        },
      });
      await writeAuditLog(tx, {
        entityType: "FINANCIAL_TRANSACTION",
        entityId: params.id,
        action: reviewStatus && reviewStatus !== existing.reviewStatus ? "STATUS_CHANGE" : "UPDATE",
        userId,
        previousValue: { notes: existing.notes, sourceType: existing.sourceType, sourceReference: existing.sourceReference, reviewStatus: existing.reviewStatus },
        newValue: { notes: result.notes, sourceType: result.sourceType, sourceReference: result.sourceReference, reviewStatus: result.reviewStatus },
        reason,
      });
      return result;
    });

    return apiSuccess(updated, "Transaksi diperbarui.");
  });
}
