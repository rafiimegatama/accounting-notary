import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { getMatterHistory } from "@/lib/history";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const history = await getMatterHistory(params.id);
    return apiSuccess(history);
  });
}
