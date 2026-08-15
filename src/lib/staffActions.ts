import { randomInt } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { writeAuditLog } from "./audit";
import { ApiError } from "./apiResponse";
import { hashPin } from "./session";
import { loginAttemptTracker } from "./loginRateLimit";

type Tx = Prisma.TransactionClient | PrismaClient;

const RESET_PIN_LENGTH = 6;

// Cryptographically random (node:crypto, not Math.random()) — this becomes
// a real credential. There's no self-service "change my PIN" flow yet, so
// in practice this generated PIN IS the staff member's PIN until the next
// reset — a known, accepted, separately-scoped gap (see CHANGELOG.md).
export function generateRandomPin(length: number = RESET_PIN_LENGTH): string {
  let pin = "";
  for (let i = 0; i < length; i++) pin += randomInt(0, 10).toString();
  return pin;
}

// Looked up fresh against the DB on every call, never trusted from the
// session cookie — same "session presence is UX only, the real check
// happens server-side" principle as requireSession()/getCurrentUser()
// elsewhere in this app. isAdmin is the one narrow exception to "every
// staff account can do everything" (schema.prisma's Staff model comment) —
// it gates only this one action.
export async function assertIsAdmin(staffId: string) {
  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff || staff.status !== "ACTIVE" || !staff.isAdmin) {
    throw new ApiError("FORBIDDEN", "Anda tidak memiliki akses untuk mereset PIN staf lain.", 403);
  }
  return staff;
}

export async function resetStaffPinTx(
  tx: Tx,
  params: { targetStaffId: string; actingStaffName: string; reason?: string }
): Promise<{ newPin: string; targetName: string }> {
  const target = await tx.staff.findUnique({ where: { id: params.targetStaffId } });
  if (!target) throw new ApiError("NOT_FOUND", "Staf tidak ditemukan.", 404);

  const newPin = generateRandomPin();
  const { hash, salt } = hashPin(newPin);

  await tx.staff.update({
    where: { id: params.targetStaffId },
    data: { pinHash: hash, pinSalt: salt },
  });

  // userId is the staff NAME (matches every other writeAuditLog call in
  // this app — audit_log.user_id is a display string, not a FK).
  await writeAuditLog(tx, {
    entityType: "STAFF",
    entityId: params.targetStaffId,
    action: "PIN_RESET",
    userId: params.actingStaffName,
    reason: params.reason,
  });

  // "Forgot PIN" and "locked out from repeated wrong guesses" usually
  // happen together — clear any active lockout window for the target so
  // they don't have to wait out the remaining cooldown right after
  // receiving a fresh PIN.
  loginAttemptTracker.recordSuccess(params.targetStaffId);

  return { newPin, targetName: target.name };
}
