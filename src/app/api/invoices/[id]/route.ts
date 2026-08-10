import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";
import { assertOneOf, INVOICE_STATUSES } from "@/lib/enums";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: { matter: { include: { client: true } }, allocations: { where: { status: "ACTIVE" } } },
    });
    if (!invoice) throw new ApiError("NOT_FOUND", "Invoice tidak ditemukan.", 404);
    return apiSuccess(invoice);
  });
}

// Closes a Step 19 gap: this is the only non-destructive way to cancel an
// invoice (status -> VOID) — there was no path to do so before.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();

    if (body.status) assertOneOf(body.status, INVOICE_STATUSES, "status");

    const existing = await prisma.invoice.findUnique({ where: { id: params.id } });
    if (!existing) throw new ApiError("NOT_FOUND", "Invoice tidak ditemukan.", 404);

    if (body.status === "VOID" && !body.reason) {
      throw new ApiError("VALIDATION_ERROR", "reason wajib diisi saat mem-void invoice.");
    }

    const next = {
      dueDate: body.dueDate ? new Date(body.dueDate) : existing.dueDate,
      allowPartialPayment: body.allowPartialPayment ?? existing.allowPartialPayment,
      status: body.status ?? existing.status,
      notes: body.notes ?? existing.notes,
    };

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.invoice.update({ where: { id: params.id }, data: next });
      await writeAuditLog(tx, {
        entityType: "INVOICE",
        entityId: params.id,
        action: existing.status !== next.status ? "STATUS_CHANGE" : "UPDATE",
        userId,
        previousValue: existing,
        newValue: result,
        reason: body.reason,
      });
      return result;
    });

    return apiSuccess(updated, "Invoice diperbarui.");
  });
}
