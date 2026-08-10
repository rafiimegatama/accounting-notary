import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";
import { assertOneOf, SOURCE_TYPES } from "@/lib/enums";

// Step 21: relaxed to allow an unfiltered call — backs the global Cost
// Details nav screen (Step 14), which was designed but never actually
// reachable until this list existed. matterId/invoiceId remain optional
// scoping filters, not requirements.
export async function GET(request: Request) {
  return withApiHandler(async () => {
    const { searchParams } = new URL(request.url);
    const matterId = searchParams.get("matterId") ?? undefined;
    const invoiceId = searchParams.get("invoiceId") ?? undefined;
    const limit = Math.min(Number(searchParams.get("limit") ?? 100), 300);

    const costDetails = await prisma.costDetail.findMany({
      where: { status: "ACTIVE", ...(matterId ? { matterId } : {}), ...(invoiceId ? { invoiceId } : {}) },
      include: { matter: { select: { id: true, matterName: true, client: { select: { id: true, name: true } } } } },
      orderBy: { costDate: "desc" },
      take: limit,
    });

    return apiSuccess(costDetails);
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();
    const { matterId, invoiceId, costDate, description, category, amount, sourceType, sourceReference, notes } = body;

    if (!matterId || !costDate || !description || amount === undefined) {
      throw new ApiError("VALIDATION_ERROR", "matterId, costDate, description, amount wajib diisi.");
    }
    const resolvedSourceType = sourceType ?? "MANUAL";
    assertOneOf(resolvedSourceType, SOURCE_TYPES, "sourceType");
    await prisma.matter.findUniqueOrThrow({ where: { id: matterId } });

    const costDetail = await prisma.$transaction(async (tx) => {
      const created = await tx.costDetail.create({
        data: {
          matterId,
          invoiceId: invoiceId ?? null,
          costDate: new Date(costDate),
          description,
          category: category ?? null,
          amount,
          sourceType: resolvedSourceType,
          sourceReference: sourceReference ?? null,
          notes: notes ?? null,
          createdBy: userId,
        },
      });
      await writeAuditLog(tx, { entityType: "COST_DETAIL", entityId: created.id, action: "CREATE", userId, newValue: created });
      return created;
    });

    return apiSuccess(costDetail, "Rincian biaya berhasil ditambahkan.", 201);
  });
}
