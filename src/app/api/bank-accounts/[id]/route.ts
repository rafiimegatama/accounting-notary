import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const bankAccount = await prisma.bankAccount.findUnique({ where: { id: params.id } });
    if (!bankAccount) throw new ApiError("NOT_FOUND", "Bank account tidak ditemukan.", 404);
    return apiSuccess(bankAccount);
  });
}

// Edits the bank account's own label fields (bank name/account name/number/
// status/notes) — NOT the disbursement.bankAccountId link itself. That link
// is set once at classify time (src/app/api/transactions/[id]/classify/
// route.ts) and has no edit path anywhere, same convention as
// disbursement.category. Mirrors src/app/api/clients/[id]/route.ts exactly,
// including the STATUS_CHANGE-vs-UPDATE audit action rule.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();

    const existing = await prisma.bankAccount.findUnique({ where: { id: params.id } });
    if (!existing) throw new ApiError("NOT_FOUND", "Bank account tidak ditemukan.", 404);

    const next = {
      bankName: body.bankName ?? existing.bankName,
      accountName: body.accountName ?? existing.accountName,
      accountNumber: body.accountNumber ?? existing.accountNumber,
      status: body.status ?? existing.status,
      notes: body.notes ?? existing.notes,
    };

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.bankAccount.update({ where: { id: params.id }, data: next });
      await writeAuditLog(tx, {
        entityType: "BANK_ACCOUNT",
        entityId: params.id,
        action: existing.status !== next.status ? "STATUS_CHANGE" : "UPDATE",
        userId,
        previousValue: existing,
        newValue: result,
        reason: body.reason,
      });
      return result;
    });

    return apiSuccess(updated, "Bank account diperbarui.");
  });
}
