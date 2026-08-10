import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getClientHistory } from "@/lib/history";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const history = await getClientHistory(params.id);
    return apiSuccess(history);
  });
}
