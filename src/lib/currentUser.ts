import { ApiError } from "./apiResponse";
import { COOKIE_NAME, verifySessionCookieValue } from "./session";

// Reads the verified, server-signed session cookie — replaces the old
// spoofable `x-staff-name` header (flagged as a known gap since Step 13;
// closed here per Section 43: "Frontend hiding buttons is NOT authorization").
// Any mutation route calling this now requires a real login, not just a
// client-typed name.
function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function getCurrentUser(request: Request): string {
  const cookieHeader = request.headers.get("cookie");
  const raw = parseCookie(cookieHeader, COOKIE_NAME);
  const session = verifySessionCookieValue(raw);
  if (!session) {
    throw new ApiError("UNAUTHENTICATED", "Sesi tidak valid atau sudah berakhir. Silakan login kembali.", 401);
  }
  return session.staffName;
}

export function getCurrentSession(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const raw = parseCookie(cookieHeader, COOKIE_NAME);
  return verifySessionCookieValue(raw);
}
