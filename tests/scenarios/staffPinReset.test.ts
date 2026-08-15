import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { call } from "../helpers/callApi";
import { prisma } from "@/lib/prisma";
import { hashPin, verifyPin } from "@/lib/session";
import { POST as resetPin } from "@/app/api/staff/[id]/reset-pin/route";

// Real DB, real route handler — proves the whole "restricted to one or two
// trusted people" design actually holds: a non-admin is rejected server-side
// (not just hidden in the UI), an admin can reset someone else's PIN, the
// old PIN genuinely stops working, and the action is attributed correctly
// in the audit trail.
describe("POST /api/staff/[id]/reset-pin", () => {
  let adminId: string;
  let nonAdminId: string;
  let targetId: string;
  const targetOldPin = "1111";

  beforeAll(async () => {
    const adminPin = hashPin("9999");
    const nonAdminPin = hashPin("8888");
    const targetPin = hashPin(targetOldPin);

    const admin = await prisma.staff.create({
      data: { name: "Test Admin", pinHash: adminPin.hash, pinSalt: adminPin.salt, isAdmin: true },
    });
    const nonAdmin = await prisma.staff.create({
      data: { name: "Test NonAdmin", pinHash: nonAdminPin.hash, pinSalt: nonAdminPin.salt, isAdmin: false },
    });
    const target = await prisma.staff.create({
      data: { name: "Test Target", pinHash: targetPin.hash, pinSalt: targetPin.salt },
    });

    adminId = admin.id;
    nonAdminId = nonAdmin.id;
    targetId = target.id;
  });

  it("rejects a non-admin caller with 403 — not just hidden in the UI, enforced server-side", async () => {
    const { status, json } = await call(resetPin, {
      method: "POST",
      staffId: nonAdminId,
      staffName: "Test NonAdmin",
      params: { id: targetId },
    });
    expect(status).toBe(403);
    expect(json.success).toBe(false);
  });

  it("rejects an unauthenticated caller with 401", async () => {
    const { status } = await call(resetPin, {
      method: "POST",
      unauthenticated: true,
      params: { id: targetId },
    });
    expect(status).toBe(401);
  });

  it("returns 404 for a nonexistent target staff id", async () => {
    const { status } = await call(resetPin, {
      method: "POST",
      staffId: adminId,
      staffName: "Test Admin",
      params: { id: randomUUID() },
    });
    expect(status).toBe(404);
  });

  it("allows an admin to reset another staff's PIN — old PIN stops working, new PIN works", async () => {
    const { status, json } = await call(resetPin, {
      method: "POST",
      staffId: adminId,
      staffName: "Test Admin",
      params: { id: targetId },
      body: { reason: "Staf lupa PIN — pengujian" },
    });
    expect(status).toBe(200);
    expect(json.data.newPin).toMatch(/^\d{6}$/);
    expect(json.data.targetName).toBe("Test Target");

    const updated = await prisma.staff.findUniqueOrThrow({ where: { id: targetId } });
    expect(verifyPin(targetOldPin, updated.pinHash, updated.pinSalt)).toBe(false);
    expect(verifyPin(json.data.newPin, updated.pinHash, updated.pinSalt)).toBe(true);
  });

  it("writes a STAFF/PIN_RESET audit log entry attributed to the acting admin", async () => {
    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "STAFF", entityId: targetId, action: "PIN_RESET" },
      orderBy: { occurredAt: "desc" },
    });
    expect(entry).not.toBeNull();
    expect(entry?.userId).toBe("Test Admin");
  });
});
