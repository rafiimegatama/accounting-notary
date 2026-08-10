import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { searchAll } from "@/lib/search";

// GET /api/search?q=... — every result carries the id needed to link
// straight to the actual record (Step 18: "harus mengarah ke actual
// records, bukan hanya text result").
export async function GET(request: Request) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const results = await searchAll(q);
    return apiSuccess(results);
  });
}
