import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getCurrentUser, getCurrentSession } from "@/lib/currentUser";
import { assertIsAdmin, resetStaffPinTx } from "@/lib/staffActions";

// POST /api/staff/[id]/reset-pin — the "forgot PIN" painkiller, restricted
// to admin staff (Staff.isAdmin, gated nowhere else in this app — see
// schema.prisma's Staff model comment). Not a role/permission system: one
// boolean flag, one gated action. Returns the new plaintext PIN exactly
// once in the response body, for the admin to relay directly to the
// locked-out staff member — never stored or logged in plaintext anywhere.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const staffName = getCurrentUser(request); // throws 401 if unauthenticated
    const session = getCurrentSession(request)!; // safe: getCurrentUser above already verified it exists

    await assertIsAdmin(session.staffId);

    const body = await request.json().catch(() => ({}));
    const reason: string | undefined = body.reason;

    const result = await prisma.$transaction((tx) =>
      resetStaffPinTx(tx, { targetStaffId: params.id, actingStaffName: staffName, reason })
    );

    return apiSuccess(result, `PIN untuk ${result.targetName} berhasil direset.`);
  });
}
