import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Section 42: server-side aggregation, no N+1 — every function here uses a
// small fixed number of queries regardless of how many matters/transactions
// exist, then reduces in memory (never re-querying per row).

const ZERO = new Prisma.Decimal(0);
function sum(values: Prisma.Decimal[]) {
  return values.reduce((a, v) => a.add(v), ZERO);
}

export async function getDashboardSummaryCards() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [activeMatters, transactionsToday, unlinked, reviewRequired, invoices, transactionSums] = await Promise.all([
    prisma.matter.count({ where: { status: "ACTIVE" } }),
    prisma.financialTransaction.count({ where: { status: "ACTIVE", transactionDate: { gte: startOfToday, lt: endOfToday } } }),
    prisma.financialTransaction.count({ where: { status: "ACTIVE", clientId: null, matterId: null } }),
    prisma.financialTransaction.count({ where: { status: "ACTIVE", reviewStatus: "REVIEW_REQUIRED" } }),
    prisma.invoice.findMany({
      where: { status: "ISSUED" },
      select: { totalAmount: true, allocations: { where: { status: "ACTIVE" }, select: { amount: true } } },
    }),
    prisma.financialTransaction.groupBy({
      by: ["financialType"],
      where: { status: "ACTIVE", financialType: { in: ["DEPOSIT", "DISBURSEMENT"] } },
      _sum: { amount: true },
    }),
  ]);

  const outstandingTotal = sum(
    invoices.map((inv) => inv.totalAmount.sub(sum(inv.allocations.map((a) => a.amount))))
  );
  const outstandingCount = invoices.filter((inv) => inv.totalAmount.sub(sum(inv.allocations.map((a) => a.amount))).gt(0)).length;

  const depositTotal = transactionSums.find((t) => t.financialType === "DEPOSIT")?._sum.amount ?? ZERO;
  const disbursementTotal = transactionSums.find((t) => t.financialType === "DISBURSEMENT")?._sum.amount ?? ZERO;

  return {
    activeMatters,
    transactionsToday,
    unlinked,
    reviewRequired,
    outstandingTotal,
    outstandingCount,
    clientFundsRemaining: depositTotal.sub(disbursementTotal),
  };
}

export async function getFinancialTrend(days: number) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const rows = await prisma.financialTransaction.groupBy({
    by: ["transactionDate", "direction"],
    where: { status: "ACTIVE", transactionDate: { gte: from } },
    _sum: { amount: true },
  });

  const byDate = new Map<string, { date: string; in: number; out: number }>();
  for (const r of rows) {
    const key = r.transactionDate.toISOString().slice(0, 10);
    const entry = byDate.get(key) ?? { date: key, in: 0, out: 0 };
    if (r.direction === "IN") entry.in = Number(r._sum.amount ?? 0);
    else entry.out = Number(r._sum.amount ?? 0);
    byDate.set(key, entry);
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getReviewDistribution() {
  const rows = await prisma.financialTransaction.groupBy({
    by: ["reviewStatus"],
    where: { status: "ACTIVE" },
    _count: { _all: true },
  });
  const get = (s: string) => rows.find((r) => r.reviewStatus === s)?._count._all ?? 0;
  return [
    { name: "Normal", value: get("NORMAL"), color: "#16A34A" },
    { name: "Warning", value: get("WARNING"), color: "#D97706" },
    { name: "Review Required", value: get("REVIEW_REQUIRED"), color: "#DC2626" },
  ];
}

// Matter Financial Overview table — one query for matters, one for cost
// sums, one for invoices+allocations (reduced per-matter in memory), one
// for deposit/disbursement sums. Four queries total, not 4×N.
export async function getMatterFinancialOverview(limit = 10) {
  const matters = await prisma.matter.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { client: { select: { id: true, name: true } } },
  });
  const matterIds = matters.map((m) => m.id);
  if (matterIds.length === 0) return [];

  const [costSums, invoices, txnSums] = await Promise.all([
    prisma.costDetail.groupBy({ by: ["matterId"], where: { matterId: { in: matterIds }, status: "ACTIVE" }, _sum: { amount: true } }),
    prisma.invoice.findMany({
      where: { matterId: { in: matterIds }, status: "ISSUED" },
      select: { matterId: true, totalAmount: true, allocations: { where: { status: "ACTIVE" }, select: { amount: true } } },
    }),
    prisma.financialTransaction.groupBy({
      by: ["matterId", "financialType"],
      where: { matterId: { in: matterIds }, status: "ACTIVE", financialType: { in: ["DEPOSIT", "DISBURSEMENT"] } },
      _sum: { amount: true },
    }),
  ]);

  return matters.map((m) => {
    const totalCost = costSums.find((c) => c.matterId === m.id)?._sum.amount ?? ZERO;
    const matterInvoices = invoices.filter((i) => i.matterId === m.id);
    const totalInvoice = sum(matterInvoices.map((i) => i.totalAmount));
    const paid = sum(matterInvoices.flatMap((i) => i.allocations.map((a) => a.amount)));
    const outstanding = totalInvoice.sub(paid);
    const deposit = txnSums.find((t) => t.matterId === m.id && t.financialType === "DEPOSIT")?._sum.amount ?? ZERO;
    const disbursement = txnSums.find((t) => t.matterId === m.id && t.financialType === "DISBURSEMENT")?._sum.amount ?? ZERO;

    return {
      id: m.id,
      matterName: m.matterName,
      clientName: m.client.name,
      status: m.status,
      totalCost,
      totalInvoice,
      paid,
      outstanding,
      depositRemaining: deposit.sub(disbursement),
    };
  });
}

export async function getRecentActivity(limit = 12) {
  return prisma.auditLog.findMany({ orderBy: { occurredAt: "desc" }, take: limit });
}
