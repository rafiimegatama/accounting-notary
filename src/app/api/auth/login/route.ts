import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { COOKIE_NAME, createSessionCookieValue, verifyPin } from "@/lib/session";

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const body = await request.json();
    const { staffId, pin } = body;
    if (!staffId || !pin) throw new ApiError("VALIDATION_ERROR", "Pilih staf dan masukkan PIN.");

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff || staff.status !== "ACTIVE" || !verifyPin(pin, staff.pinHash, staff.pinSalt)) {
      // Deliberately identical message whether staff doesn't exist or PIN
      // is wrong — doesn't help an attacker enumerate valid staff IDs.
      throw new ApiError("INVALID_CREDENTIALS", "PIN salah. Silakan coba lagi.", 401);
    }

    const res = apiSuccess({ id: staff.id, name: staff.name }, "Login berhasil.");
    res.cookies.set(COOKIE_NAME, createSessionCookieValue(staff.id, staff.name), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return res;
  });
}
