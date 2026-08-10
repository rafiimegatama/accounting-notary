import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditAction, AuditEntityType } from "./enums";

type Tx = Prisma.TransactionClient | PrismaClient;

// Every mutation that changes a financial record's meaningful state must
// call this — see CLAUDE.md constraint #8. Callers pass the same `tx`
// they used for the mutation itself so the audit entry commits atomically
// with the change it describes (no window where one exists without the other).
export async function writeAuditLog(
  tx: Tx,
  params: {
    entityType: AuditEntityType;
    entityId: string;
    action: AuditAction;
    userId: string;
    previousValue?: unknown;
    newValue?: unknown;
    reason?: string;
  }
) {
  await tx.auditLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      userId: params.userId,
      previousValue: params.previousValue as Prisma.InputJsonValue | undefined,
      newValue: params.newValue as Prisma.InputJsonValue | undefined,
      reason: params.reason,
    },
  });
}
