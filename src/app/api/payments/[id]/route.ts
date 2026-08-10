import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
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
