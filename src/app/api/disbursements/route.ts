import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";

export async function GET(request: Request) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const matterId = searchParams.get("matterId") ?? undefined;
    const clientId = searchParams.get("clientId") ?? undefined;

    const disbursements = await prisma.disbursement.findMany({
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

    return apiSuccess(disbursements);
  });
}
