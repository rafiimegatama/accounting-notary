import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentSession } from "@/lib/currentUser";
import { verifyPin } from "@/lib/session";

// Used by the Lock Screen (Section 23): re-enter PIN of the currently
// logged-in staff to unlock, without a full logout/login round-trip.
export async function POST(request: Request) {
  return withApiHandler(async () => {
    const session = getCurrentSession(request);
    if (!session) throw new ApiError("UNAUTHENTICATED", "Sesi berakhir. Silakan login kembali.", 401);

    const { pin } = await request.json();
    const staff = await prisma.staff.findUnique({ where: { id: session.staffId } });
    if (!staff || !verifyPin(pin, staff.pinHash, staff.pinSalt)) {
      throw new ApiError("INVALID_CREDENTIALS", "PIN salah.", 401);
    }
    return apiSuccess(null, "Unlocked.");
  });
}
