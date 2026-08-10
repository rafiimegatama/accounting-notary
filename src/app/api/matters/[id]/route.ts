import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const matter = await prisma.matter.findUnique({ where: { id: params.id }, include: { client: true } });
    if (!matter) throw new ApiError("NOT_FOUND", "Matter tidak ditemukan.", 404);
    return apiSuccess(matter);
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();

    const existing = await prisma.matter.findUnique({ where: { id: params.id } });
    if (!existing) throw new ApiError("NOT_FOUND", "Matter tidak ditemukan.", 404);

    const next = {
      matterName: body.matterName ?? existing.matterName,
      matterType: body.matterType ?? existing.matterType,
      service: body.service ?? existing.service,
      status: body.status ?? existing.status,
      responsibleStaff: body.responsibleStaff ?? existing.responsibleStaff,
      notes: body.notes ?? existing.notes,
    };

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.matter.update({ where: { id: params.id }, data: next });
      await writeAuditLog(tx, {
        entityType: "MATTER",
        entityId: params.id,
        action: existing.status !== next.status ? "STATUS_CHANGE" : "UPDATE",
        userId,
        previousValue: existing,
        newValue: result,
        reason: body.reason,
      });
      return result;
    });

    return apiSuccess(updated, "Matter diperbarui.");
  });
}
