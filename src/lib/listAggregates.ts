import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const ZERO = new Prisma.Decimal(0);
function sum(values: Prisma.Decimal[]) {
  return values.reduce((a, v) => a.add(v), ZERO);
}

// Backs the Clients tab of /clients (Section 8). Same "batch queries, reduce
// in memory" approach as src/lib/dashboard.ts — avoids N+1 across clients.
export async function getClientListWithAggregates(search?: string) {
  const clients = await prisma.client.findMany({
    where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
    include: { matters: { select: { id: true, status: true } } },
  });
  const clientIds = clients.map((c) => c.id);
  if (clientIds.length === 0) return [];

  const [txnActivitySum, txnLastActivity, invoicesByClient, depositDisbursementSums] = await Promise.all([
    prisma.financialTransaction.groupBy({ by: ["clientId"], where: { clientId: { in: clientIds }, status: "ACTIVE" }, _sum: { amount: true } }),
    prisma.financialTransaction.groupBy({ by: ["clientId"], where: { clientId: { in: clientIds }, status: "ACTIVE" }, _max: { transactionDate: true } }),
    prisma.invoice.findMany({
      where: { matter: { clientId: { in: clientIds } }, status: "ISSUED" },
      select: { matter: { select: { clientId: true } }, totalAmount: true, allocations: { where: { status: "ACTIVE" }, select: { amount: true } } },
    }),
    prisma.financialTransaction.groupBy({
      by: ["clientId", "financialType"],
      where: { clientId: { in: clientIds }, status: "ACTIVE", financialType: { in: ["DEPOSIT", "DISBURSEMENT"] } },
      _sum: { amount: true },
    }),
  ]);

  return clients.map((c) => {
    const activeMatters = c.matters.filter((m) => m.status === "ACTIVE").length;
    const totalActivity = txnActivitySum.find((t) => t.clientId === c.id)?._sum.amount ?? ZERO;
    const lastActivity = txnLastActivity.find((t) => t.clientId === c.id)?._max.transactionDate ?? null;
    const clientInvoices = invoicesByClient.filter((i) => i.matter.clientId === c.id);
    const outstanding = sum(clientInvoices.map((i) => i.totalAmount.sub(sum(i.allocations.map((a) => a.amount)))));
    const deposit = depositDisbursementSums.find((t) => t.clientId === c.id && t.financialType === "DEPOSIT")?._sum.amount ?? ZERO;
    const disbursement = depositDisbursementSums.find((t) => t.clientId === c.id && t.financialType === "DISBURSEMENT")?._sum.amount ?? ZERO;

    return {
      id: c.id,
      name: c.name,
      clientType: c.clientType,
      status: c.status,
      activeMatters,
      totalMatters: c.matters.length,
      totalActivity,
      outstanding,
      depositRemaining: deposit.sub(disbursement),
      lastActivity,
    };
  });
}
