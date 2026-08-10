import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getMatterFinancialPosition } from "@/lib/position";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const position = await getMatterFinancialPosition(params.id);
    return apiSuccess(position);
  });
}
