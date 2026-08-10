import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      include: {
        transaction: { include: { client: true, matter: true } },
        allocations: { include: { invoice: true } },
      },
    });
    if (!payment) throw new ApiError("NOT_FOUND", "Payment tidak ditemukan.", 404);
    return apiSuccess(payment);
  });
}
