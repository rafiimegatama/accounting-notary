import { NextRequest, NextResponse } from "next/server";

// Convenience redirect only — checks the session cookie is PRESENT, not
// that its signature is valid (Next.js Middleware runs on the Edge runtime,
// which can't use Node's `crypto` module the way src/lib/session.ts does).
// The real, cryptographically-verified check happens server-side in every
// page (via requireSession()) and every API route (via getCurrentUser/
// getCurrentSession) — this middleware only avoids flashing protected UI
// before that real check runs. See Section 43: this alone is NOT authorization.
const PUBLIC_PATHS = ["/login"];
const PUBLIC_API_PREFIXES = ["/api/auth/"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const hasSessionCookie = Boolean(request.cookies.get("notary_session")?.value);

  if (!hasSessionCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, errorCode: "UNAUTHENTICATED", message: "Belum login.", timestamp: new Date().toISOString() },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
