import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Minimal local auth session — Section 23. Stateless signed cookie (HMAC),
// no session table, appropriate for a single-office LOCAL app. This
// replaces the old spoofable `x-staff-name` header as the source of truth
// for "who is doing this" (see src/lib/currentUser.ts).

const COOKIE_NAME = "notary_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h — a work day

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set.");
  return s;
}

export interface SessionPayload {
  staffId: string;
  staffName: string;
  exp: number;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("hex");
}

export function createSessionCookieValue(staffId: string, staffName: string): string {
  const payload: SessionPayload = { staffId, staffName, exp: Date.now() + SESSION_TTL_MS };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(json);
  return `${json}.${sig}`;
}

export function verifySessionCookieValue(value: string | undefined | null): SessionPayload | null {
  if (!value) return null;
  const [json, sig] = value.split(".");
  if (!json || !sig) return null;
  const expectedSig = sign(json);
  if (sig.length !== expectedSig.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME };

// PIN hashing via scrypt (Node built-in, no extra dependency for bcrypt).
export function hashPin(pin: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPin(pin: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(pin, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
