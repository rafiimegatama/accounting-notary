import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySessionCookieValue } from "./session";

// Real (cryptographically verified) session check for Server Component
// pages — the middleware's cookie-presence check is only a UX convenience,
// this is the actual enforcement.
export function requireSession() {
  const raw = cookies().get(COOKIE_NAME)?.value;
  const session = verifySessionCookieValue(raw);
  if (!session) redirect("/login");
  return session;
}
