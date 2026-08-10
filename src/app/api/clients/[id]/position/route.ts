import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { getClientFinancialPosition } from "@/lib/position";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const position = await getClientFinancialPosition(params.id);
    return apiSuccess(position);
  });
}
