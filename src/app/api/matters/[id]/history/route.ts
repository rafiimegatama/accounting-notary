import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getMatterHistory } from "@/lib/history";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const history = await getMatterHistory(params.id);
    return apiSuccess(history);
  });
}
