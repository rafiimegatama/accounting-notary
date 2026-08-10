import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { buildTransactionTrace, resolveTransactionIds, TraceEntryType } from "@/lib/trace";

const VALID_ENTRY_TYPES: TraceEntryType[] = ["TRANSACTION", "PAYMENT", "INVOICE", "COST_DETAIL"];

// GET /api/trace/[entryId]?entryType=TRANSACTION|PAYMENT|INVOICE|COST_DETAIL
// Multi-entry per Step 8 (validated: staff also trace from cost detail).
// Returns an array because INVOICE/COST_DETAIL entries can resolve to more
// than one underlying transaction (an invoice paid across several payments).
export async function GET(request: Request, { params }: { params: { entryId: string } }) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const entryType = (searchParams.get("entryType") ?? "TRANSACTION") as TraceEntryType;
    if (!VALID_ENTRY_TYPES.includes(entryType)) {
      throw new ApiError("VALIDATION_ERROR", `entryType harus salah satu dari: ${VALID_ENTRY_TYPES.join(", ")}.`);
    }

    const transactionIds = await resolveTransactionIds(entryType, params.entryId);
    const traces = await Promise.all(transactionIds.map((id) => buildTransactionTrace(id)));

    return apiSuccess(traces);
  });
}
