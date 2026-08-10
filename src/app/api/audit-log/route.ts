import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";

// GET /api/audit-log — Section 22, read-only. No POST/PATCH/DELETE here on
// purpose: "Do not allow edit/delete from normal UI" — this file only ever
// exports GET, so there is no code path that could mutate audit_log through
// the API even by mistake later.
export async function GET(request: Request) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType") ?? undefined;
    const entityId = searchParams.get("entityId") ?? undefined;
    const userId = searchParams.get("userId") ?? undefined;
    const action = searchParams.get("action") ?? undefined;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);

    const entries = await prisma.auditLog.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
        ...(userId ? { userId } : {}),
        ...(action ? { action } : {}),
        ...(dateFrom || dateTo
          ? { occurredAt: { gte: dateFrom ? new Date(dateFrom) : undefined, lte: dateTo ? new Date(dateTo) : undefined } }
          : {}),
      },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });

    return apiSuccess(entries);
  });
}
