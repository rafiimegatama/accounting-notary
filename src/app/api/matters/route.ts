import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request) {
  return withApiHandler(async () => {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId") ?? undefined;
    const matters = await prisma.matter.findMany({
      where: clientId ? { clientId } : undefined,
      orderBy: { createdAt: "desc" },
      include: { client: { select: { id: true, name: true } } },
    });
    return apiSuccess(matters);
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();
    if (!body.clientId || !body.matterName) throw new ApiError("VALIDATION_ERROR", "clientId dan matterName wajib diisi.");
    await prisma.client.findUniqueOrThrow({ where: { id: body.clientId } });

    const matter = await prisma.$transaction(async (tx) => {
      const created = await tx.matter.create({
        data: {
          clientId: body.clientId,
          matterName: body.matterName,
          matterType: body.matterType ?? null,
          service: body.service ?? null,
          responsibleStaff: body.responsibleStaff ?? null,
          notes: body.notes ?? null,
          createdBy: userId,
        },
      });
      await writeAuditLog(tx, { entityType: "MATTER", entityId: created.id, action: "CREATE", userId, newValue: created });
      return created;
    });

    return apiSuccess(matter, "Matter berhasil dibuat.", 201);
  });
}
