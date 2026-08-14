import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { assertVoidable, voidFinancialTransactionTx } from "@/lib/financialTransactionActions";

// POST /api/transactions/[id]/void — closes the last real Step 19 gap: the
// DDL (Step 11) already has status/voided_at/voided_by/void_reason columns
// specifically so a wrong transaction can be corrected without DELETE
// (blocked by trigger anyway) and without mutating amount/date/direction
// (also blocked by trigger). Until this endpoint existed, those columns
// were unreachable — VOID never actually happened.
//
// The validation + mutation + audit shape now lives in
// financialTransactionActions.ts so POST /api/payments/[id]/correct
// (Roadmap #2) can reuse the exact same void behavior instead of a second,
// possibly-diverging implementation. This route's own behavior/response is
// unchanged by that extraction.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const reason: string | undefined = body.reason;
    if (!reason || !reason.trim()) throw new ApiError("VALIDATION_ERROR", "reason wajib diisi untuk void transaksi.");

    const existing = await assertVoidable(params.id);

    const voided = await prisma.$transaction((tx) =>
      voidFinancialTransactionTx(tx, { transactionId: params.id, userId, reason, previousStatus: existing.status })
    );

    return apiSuccess(voided, "Transaksi berhasil di-void.");
  });
}
