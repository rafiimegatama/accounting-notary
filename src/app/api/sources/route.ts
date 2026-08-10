import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { getSourcesList } from "@/lib/sources";

// GET /api/sources — Section 20. See src/lib/sources.ts for why this unions
// financial_transaction + cost_detail instead of a new table (graceful
// degradation on the known Step 22 Document/Source warning, not a new architecture).
export async function GET(request: Request) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 100), 300);
    return apiSuccess(await getSourcesList(limit));
  });
}
