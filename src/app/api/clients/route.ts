import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";

// Not in Step 13's explicit minimal list, but a prerequisite for it: there
// is no "client financial position" to GET without a way to create clients.
export async function GET(request: Request) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const clients = await prisma.client.findMany({
      where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
      orderBy: { name: "asc" },
    });
    return apiSuccess(clients);
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();
    if (!body.name) throw new ApiError("VALIDATION_ERROR", "name wajib diisi.");

    const client = await prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          name: body.name,
          clientType: body.clientType ?? null,
          contactPhone: body.contactPhone ?? null,
          contactEmail: body.contactEmail ?? null,
          contactAddress: body.contactAddress ?? null,
          identityNumber: body.identityNumber ?? null,
          notes: body.notes ?? null,
          createdBy: userId,
        },
      });
      await writeAuditLog(tx, { entityType: "CLIENT", entityId: created.id, action: "CREATE", userId, newValue: created });
      return created;
    });

    return apiSuccess(client, "Client berhasil dibuat.", 201);
  });
}
