import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { getMatterFinancialPosition } from "@/lib/position";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const position = await getMatterFinancialPosition(params.id);
    return apiSuccess(position);
  });
}
