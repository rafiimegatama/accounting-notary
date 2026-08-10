import { prisma } from "./prisma";

// Shared by /api/matters/[id]/history, /api/clients/[id]/history, and the
// Financial Position page (Step 15) directly — one implementation instead
// of duplicating the query in both the route handler and the server component.
export async function getMatterHistory(matterId: string) {
  const transactions = await prisma.financialTransaction.findMany({ where: { matterId }, select: { id: true } });
  return prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "MATTER", entityId: matterId },
        { entityType: "FINANCIAL_TRANSACTION", entityId: { in: transactions.map((t) => t.id) } },
      ],
    },
    orderBy: { occurredAt: "desc" },
  });
}

export async function getClientHistory(clientId: string) {
  const transactions = await prisma.financialTransaction.findMany({ where: { clientId }, select: { id: true } });
  return prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "CLIENT", entityId: clientId },
        { entityType: "FINANCIAL_TRANSACTION", entityId: { in: transactions.map((t) => t.id) } },
      ],
    },
    orderBy: { occurredAt: "desc" },
  });
}
