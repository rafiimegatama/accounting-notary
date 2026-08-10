import { ApiError } from "./apiResponse";

// DESIGN ASSUMPTION (flagged, needs validation — see Step 13 notes):
// there is no authentication system in this MVP. "Current user" is a
// staff-chosen identifier sent by the frontend, used ONLY to populate
// created_by / user_id on audit trail records. It is identification,
// not access control — anyone with network access to the app can send
// any name. Building real auth was out of scope because discovery never
// surfaced a security/access-control pain point; if that changes, this
// is the single place to replace with a real session mechanism.
export function getCurrentUser(request: Request): string {
  const staffName = request.headers.get("x-staff-name");
  if (!staffName || staffName.trim().length === 0) {
    throw new ApiError("STAFF_IDENTITY_MISSING", "Header x-staff-name wajib diisi (identifikasi staf untuk audit trail).", 401);
  }
  return staffName.trim();
}
