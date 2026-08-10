import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentSession } from "@/lib/currentUser";

export async function GET(request: Request) {
  return withApiHandler(async () => {
    const session = getCurrentSession(request);
    if (!session) throw new ApiError("UNAUTHENTICATED", "Belum login.", 401);
    return apiSuccess({ staffId: session.staffId, staffName: session.staffName });
  });
}
