// Pure mapping from a /api/auth/verify-pin response to the message the
// Lock Screen should display, extracted out of LockOverlay's submit()
// handler so the deterministic part of "wrong PIN stays locked / correct
// PIN unlocks" is unit-testable without a DOM.
export interface VerifyPinResponse {
  success: boolean;
  errorCode?: string;
  message?: string;
}

// null → returns an error (unlock never happens); non-null with
// success:true → returns null (the only case the caller should unlock).
export function resolveVerifyPinError(json: VerifyPinResponse | null): string | null {
  if (!json) return "Terjadi kesalahan saat memverifikasi PIN. Silakan coba lagi.";
  if (json.success) return null;
  // /api/auth/verify-pin returns "PIN salah." for a wrong PIN (shared
  // wording with the login route) — the Lock Screen spec mandates its own
  // exact copy instead, so wrong-PIN is worded here rather than trusting
  // the server string verbatim. Any other failure (most notably an
  // actually-expired 12h session, distinct from a wrong PIN) keeps its own
  // real server message — that's more useful than a generic fallback.
  if (json.errorCode === "INVALID_CREDENTIALS") return "PIN tidak sesuai. Silakan coba lagi.";
  return json.message || "Terjadi kesalahan saat memverifikasi PIN. Silakan coba lagi.";
}
