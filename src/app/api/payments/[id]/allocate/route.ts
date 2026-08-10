import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";
import { assertOneOf, ALLOCATION_TYPES } from "@/lib/enums";
import { recomputeReviewStatus } from "@/lib/exceptionRules";

// POST /api/payments/[id]/allocate — Step 6/9: distributes a payment across
// invoice(s) or deposit-topup. Never blocks on over/under-allocation — it
// creates the allocation and lets recomputeReviewStatus flag the outcome
// (WARNING/REVIEW_REQUIRED) for a human to look at, per Step 9's
// "never an automatic financial decision, never blocking" principle.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();
    const { invoiceId, allocationType, amount, notes } = body;

    if (!allocationType || amount === undefined) {
      throw new ApiError("VALIDATION_ERROR", "allocationType dan amount wajib diisi.");
    }
    assertOneOf(allocationType, ALLOCATION_TYPES, "allocationType");
    if (allocationType === "INVOICE_PAYMENT" && !invoiceId) {
      throw new ApiError("VALIDATION_ERROR", "invoiceId wajib diisi untuk allocationType INVOICE_PAYMENT.");
    }

    const payment = await prisma.payment.findUnique({ where: { id: params.id } });
    if (!payment) throw new ApiError("NOT_FOUND", "Payment tidak ditemukan.", 404);

    const allocation = await prisma.$transaction(async (tx) => {
      const created = await tx.paymentAllocation.create({
        data: {
          paymentId: params.id,
          invoiceId: invoiceId ?? null,
          allocationType,
          amount,
          notes: notes ?? null,
          createdBy: userId,
        },
      });
      await writeAuditLog(tx, {
        entityType: "PAYMENT_ALLOCATION",
        entityId: created.id,
        action: "ALLOCATE",
        userId,
        newValue: created,
      });
      await recomputeReviewStatus(tx, payment.financialTransactionId, userId);
      return created;
    });

    return apiSuccess(allocation, "Alokasi payment berhasil dicatat.", 201);
  });
}
