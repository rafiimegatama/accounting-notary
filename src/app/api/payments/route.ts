import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";

// GET /api/payments?matterId=...&clientId=...
export async function GET(request: Request) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const matterId = searchParams.get("matterId") ?? undefined;
    const clientId = searchParams.get("clientId") ?? undefined;

    const payments = await prisma.payment.findMany({
      where: {
        transaction: {
          status: "ACTIVE",
          ...(matterId ? { matterId } : {}),
          ...(clientId ? { clientId } : {}),
        },
      },
      include: {
        transaction: true,
        allocations: { where: { status: "ACTIVE" }, include: { invoice: { select: { id: true, invoiceNumber: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess(payments);
  });
}
