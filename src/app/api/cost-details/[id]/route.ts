import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";

// PATCH allows description/category/amount/invoiceId/status/notes updates.
// Every change is captured with before/after in the audit log (Step 4:
// COST_DETAIL.amount is mutable but never a silent overwrite).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();

    const existing = await prisma.costDetail.findUnique({ where: { id: params.id } });
    if (!existing) throw new ApiError("NOT_FOUND", "Cost detail tidak ditemukan.", 404);

    const next = {
      description: body.description ?? existing.description,
      category: body.category ?? existing.category,
      amount: body.amount ?? existing.amount,
      invoiceId: body.invoiceId !== undefined ? body.invoiceId : existing.invoiceId,
      status: body.status ?? existing.status,
      notes: body.notes ?? existing.notes,
    };

    // Action precedence: a status flip (e.g. VOID) is the most significant
    // fact about the change; otherwise an amount change is an ADJUSTMENT
    // (a correction to a financial figure) distinct from a plain metadata UPDATE.
    const amountChanged = body.amount !== undefined && String(body.amount) !== existing.amount.toString();
    const action = existing.status !== next.status ? "STATUS_CHANGE" : amountChanged ? "ADJUSTMENT" : "UPDATE";
    if (action === "ADJUSTMENT" && !body.reason) {
      throw new ApiError("VALIDATION_ERROR", "reason wajib diisi saat mengubah amount cost detail.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.costDetail.update({ where: { id: params.id }, data: next });
      await writeAuditLog(tx, {
        entityType: "COST_DETAIL",
        entityId: params.id,
        action,
        userId,
        previousValue: existing,
        newValue: result,
        reason: body.reason,
      });
      return result;
    });

    return apiSuccess(updated, "Cost detail diperbarui.");
  });
}
