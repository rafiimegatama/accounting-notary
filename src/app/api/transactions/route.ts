import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";
import { assertOneOf, FINANCIAL_TYPES, SOURCE_TYPES, TRANSACTION_DIRECTIONS } from "@/lib/enums";

// GET /api/transactions — Collect/Link/Exception queues all read through
// here with different filter combinations (Step 5/9/16).
//   ?unlinked=true            -> Unlinked/Review screen (Step 16)
//   ?reviewStatus=REVIEW_REQUIRED -> exception queue (Step 9)
//   ?clientId=... / ?matterId=... -> scoped listing
export async function GET(request: Request) {
  return withApiHandler(async () => {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId") ?? undefined;
    const matterId = searchParams.get("matterId") ?? undefined;
    const unlinked = searchParams.get("unlinked") === "true";
    const reviewStatus = searchParams.get("reviewStatus") ?? undefined;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
    const offset = Number(searchParams.get("offset") ?? 0);

    const transactions = await prisma.financialTransaction.findMany({
      where: {
        status: "ACTIVE",
        ...(unlinked ? { clientId: null, matterId: null } : {}),
        ...(clientId ? { clientId } : {}),
        ...(matterId ? { matterId } : {}),
        ...(reviewStatus ? { reviewStatus } : {}),
        ...(dateFrom || dateTo
          ? { transactionDate: { gte: dateFrom ? new Date(dateFrom) : undefined, lte: dateTo ? new Date(dateTo) : undefined } }
          : {}),
      },
      orderBy: { transactionDate: "desc" },
      take: limit,
      skip: offset,
      include: { client: { select: { id: true, name: true } }, matter: { select: { id: true, matterName: true } } },
    });

    return apiSuccess(transactions);
  });
}

// POST /api/transactions — Collect workflow (Step 5). client/matter are
// optional by design: this must succeed with both null (UNLINKED).
export async function POST(request: Request) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();

    const { transactionDate, amount, direction, description, clientId, matterId, financialType, sourceType, sourceReference, notes } = body;

    if (!transactionDate || !amount || !direction || !description) {
      throw new ApiError("VALIDATION_ERROR", "transactionDate, amount, direction, description wajib diisi.");
    }
    assertOneOf(direction, TRANSACTION_DIRECTIONS, "direction");
    if (financialType) assertOneOf(financialType, FINANCIAL_TYPES, "financialType");
    const resolvedSourceType = sourceType ?? "SOURCE_PENDING";
    assertOneOf(resolvedSourceType, SOURCE_TYPES, "sourceType");

    let resolvedClientId: string | null = clientId ?? null;
    if (matterId) {
      const matter = await prisma.matter.findUniqueOrThrow({ where: { id: matterId } });
      if (resolvedClientId && resolvedClientId !== matter.clientId) {
        throw new ApiError("CLIENT_MATTER_MISMATCH", "clientId yang diberikan tidak sesuai dengan client pemilik matter tersebut.");
      }
      resolvedClientId = matter.clientId;
    }

    const warnOnMissingSourceSetting = await prisma.systemSetting.findUnique({ where: { key: "warn_on_missing_source" } });
    const warnOnMissingSource = (warnOnMissingSourceSetting?.value ?? "true") === "true";
    const reviewStatus = resolvedSourceType === "SOURCE_PENDING" && warnOnMissingSource ? "WARNING" : "NORMAL";

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.financialTransaction.create({
        data: {
          transactionDate: new Date(transactionDate),
          amount,
          direction,
          description,
          financialType: financialType ?? "UNCLASSIFIED",
          clientId: resolvedClientId,
          matterId: matterId ?? null,
          sourceType: resolvedSourceType,
          sourceReference: sourceReference ?? null,
          reviewStatus,
          notes: notes ?? null,
          createdBy: userId,
        },
      });
      await writeAuditLog(tx, {
        entityType: "FINANCIAL_TRANSACTION",
        entityId: created.id,
        action: "CREATE",
        userId,
        newValue: created,
      });
      return created;
    });

    return apiSuccess(transaction, "Transaksi berhasil dicatat.", 201);
  });
}
