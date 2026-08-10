import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";

// GET /api/deposits?matterId=...&clientId=... — flat list, backs the
// top-level Deposits screen (Section 17). Reuses the exact same filter
// shape as /api/payments.
export async function GET(request: Request) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const matterId = searchParams.get("matterId") ?? undefined;
    const clientId = searchParams.get("clientId") ?? undefined;

    const deposits = await prisma.deposit.findMany({
      where: {
        transaction: {
          status: "ACTIVE",
          ...(matterId ? { matterId } : {}),
          ...(clientId ? { clientId } : {}),
        },
      },
      include: { transaction: { include: { client: true, matter: true } } },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess(deposits);
  });
}
