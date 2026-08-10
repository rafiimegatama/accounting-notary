import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler } from "@/lib/apiResponse";

// GET /api/exceptions/review-required?includeWarning=true
// Step 9: NORMAL/WARNING/REVIEW_REQUIRED — WARNING is soft/informational,
// REVIEW_REQUIRED needs attention. Default returns REVIEW_REQUIRED only;
// ?includeWarning=true also surfaces WARNING items for a broader queue view.
export async function GET(request: Request) {
  return withApiHandler(async () => {
    const { searchParams } = new URL(request.url);
    const includeWarning = searchParams.get("includeWarning") === "true";

    const items = await prisma.financialTransaction.findMany({
      where: {
        status: "ACTIVE",
        reviewStatus: includeWarning ? { in: ["WARNING", "REVIEW_REQUIRED"] } : "REVIEW_REQUIRED",
      },
      include: { client: { select: { id: true, name: true } }, matter: { select: { id: true, matterName: true } } },
      orderBy: { transactionDate: "desc" },
    });

    return apiSuccess(items);
  });
}
