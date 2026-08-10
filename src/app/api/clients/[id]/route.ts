import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const client = await prisma.client.findUnique({ where: { id: params.id }, include: { matters: true } });
    if (!client) throw new ApiError("NOT_FOUND", "Client tidak ditemukan.", 404);
    return apiSuccess(client);
  });
}

// Closes a Step 19 gap: CLIENT had no update path at all, so "Update" as
// a required auditable action was unreachable for this entity.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();

    const existing = await prisma.client.findUnique({ where: { id: params.id } });
    if (!existing) throw new ApiError("NOT_FOUND", "Client tidak ditemukan.", 404);

    const next = {
      name: body.name ?? existing.name,
      clientType: body.clientType ?? existing.clientType,
      contactPhone: body.contactPhone ?? existing.contactPhone,
      contactEmail: body.contactEmail ?? existing.contactEmail,
      contactAddress: body.contactAddress ?? existing.contactAddress,
      identityNumber: body.identityNumber ?? existing.identityNumber,
      status: body.status ?? existing.status,
      notes: body.notes ?? existing.notes,
    };

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.client.update({ where: { id: params.id }, data: next });
      await writeAuditLog(tx, {
        entityType: "CLIENT",
        entityId: params.id,
        action: existing.status !== next.status ? "STATUS_CHANGE" : "UPDATE",
        userId,
        previousValue: existing,
        newValue: result,
        reason: body.reason,
      });
      return result;
    });

    return apiSuccess(updated, "Client diperbarui.");
  });
}
