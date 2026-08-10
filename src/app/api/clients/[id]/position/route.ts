import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getClientFinancialPosition } from "@/lib/position";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const position = await getClientFinancialPosition(params.id);
    return apiSuccess(position);
  });
}
