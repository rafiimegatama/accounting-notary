import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { COOKIE_NAME, cookieSecure, createSessionCookieValue, verifyPin } from "@/lib/session";
import { loginAttemptTracker } from "@/lib/loginRateLimit";

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const body = await request.json();
    const { staffId, pin } = body;
    if (!staffId || !pin) throw new ApiError("VALIDATION_ERROR", "Pilih staf dan masukkan PIN.");

    // Keyed by staffId, not source IP — the PIN is the thing being
    // brute-forced, and this stays robust whether the request comes
    // through ngrok, Caddy, or the plain LAN port.
    const lockout = loginAttemptTracker.checkLockout(staffId);
    if (lockout.locked) {
      const minutes = Math.ceil(lockout.retryAfterMs / 60000);
      throw new ApiError(
        "ACCOUNT_LOCKED",
        `Terlalu banyak percobaan PIN salah. Coba lagi dalam ${minutes} menit.`,
        429
      );
    }

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff || staff.status !== "ACTIVE" || !verifyPin(pin, staff.pinHash, staff.pinSalt)) {
      loginAttemptTracker.recordFailure(staffId);
      // Deliberately identical message whether staff doesn't exist or PIN
      // is wrong — doesn't help an attacker enumerate valid staff IDs.
      throw new ApiError("INVALID_CREDENTIALS", "PIN salah. Silakan coba lagi.", 401);
    }
    loginAttemptTracker.recordSuccess(staffId);

    const res = apiSuccess({ id: staff.id, name: staff.name }, "Login berhasil.");
    res.cookies.set(COOKIE_NAME, createSessionCookieValue(staff.id, staff.name), {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return res;
  });
}
