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

  const [activeMatters, transactionsToday, unlinked, reviewRequired, sourcePending, invoices, transactionSums, payments] = await Promise.all([
    prisma.matter.count({ where: { status: "ACTIVE" } }),
    prisma.financialTransaction.count({ where: { status: "ACTIVE", transactionDate: { gte: startOfToday, lt: endOfToday } } }),
    prisma.financialTransaction.count({ where: { status: "ACTIVE", clientId: null, matterId: null } }),
    prisma.financialTransaction.count({ where: { status: "ACTIVE", reviewStatus: "REVIEW_REQUIRED" } }),
    // P1.2 "Needs Attention": source not yet filled in — WARNING-eligible
    // per the existing SOURCE_PENDING -> WARNING rule, not a new state.
    prisma.financialTransaction.count({ where: { status: "ACTIVE", sourceType: "SOURCE_PENDING" } }),
    prisma.invoice.findMany({
      where: { status: "ISSUED" },
      select: { totalAmount: true, dueDate: true, allocations: { where: { status: "ACTIVE" }, select: { amount: true } } },
    }),
    prisma.financialTransaction.groupBy({
      by: ["financialType"],
      where: { status: "ACTIVE", financialType: { in: ["DEPOSIT", "DISBURSEMENT"] } },
      _sum: { amount: true },
    }),
    // Phase 4 "Unallocated Payments" — same fetch-then-reduce shape as
    // outstandingCount below, not a new query pattern.
    prisma.payment.findMany({
      where: { transaction: { status: "ACTIVE" } },
      select: { transaction: { select: { amount: true } }, allocations: { where: { status: "ACTIVE" }, select: { amount: true } } },
    }),
  ]);

  const outstandingTotal = sum(
    invoices.map((inv) => inv.totalAmount.sub(sum(inv.allocations.map((a) => a.amount))))
  );
  const outstandingCount = invoices.filter((inv) => inv.totalAmount.sub(sum(inv.allocations.map((a) => a.amount))).gt(0)).length;
  const unallocatedPaymentCount = payments.filter((p) => sum(p.allocations.map((a) => a.amount)).lt(p.transaction.amount)).length;

  // Overdue: outstanding invoice whose dueDate has passed — reuses the same
  // invoices fetch as outstandingTotal/outstandingCount above, just an
  // extra filter, not a new query.
  const overdueInvoices = invoices.filter((inv) => {
    const outstanding = inv.totalAmount.sub(sum(inv.allocations.map((a) => a.amount)));
    return outstanding.gt(0) && inv.dueDate !== null && inv.dueDate < startOfToday;
  });
  const overdueCount = overdueInvoices.length;
  const overdueTotal = sum(overdueInvoices.map((inv) => inv.totalAmount.sub(sum(inv.allocations.map((a) => a.amount)))));

  const depositTotal = transactionSums.find((t) => t.financialType === "DEPOSIT")?._sum.amount ?? ZERO;
  const disbursementTotal = transactionSums.find((t) => t.financialType === "DISBURSEMENT")?._sum.amount ?? ZERO;

  return {
    activeMatters,
    transactionsToday,
    unlinked,
    reviewRequired,
    sourcePending,
    unallocatedPaymentCount,
    outstandingTotal,
    outstandingCount,
    overdueCount,
    overdueTotal,
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

// Unlinked backlog aging — un-windowed current snapshot of transactions
// still without a client/matter, bucketed by how old they are. Deliberately
// NOT a trend over time: a previous version bucketed by transaction date
// within a rolling window while filtering by *current* link status, which
// silently conflated "recent activity" with "shrinking backlog" and read as
// misleading. This mirrors getOutstandingAging()'s shape exactly (single
// query, reduce in memory, today normalized to midnight) but answers "how
// old is today's unlinked backlog", not "is it growing or shrinking".
// Unlike invoice aging, an old unlinked transaction is NOT automatically
// "worse" — UNLINKED can be a permanent, valid state (CLAUDE.md §7 #2,
// highest-rated pain point in the product). Buckets therefore use a single
// flat color (not an escalating ramp) and count (not Rupiah) as the primary
// metric, since unlinked transactions mix both IN and OUT direction.
export async function getUnlinkedBacklogAging() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };

  const txns = await prisma.financialTransaction.findMany({
    where: { status: "ACTIVE", clientId: null, matterId: null },
    select: { id: true, amount: true, transactionDate: true },
  });

  const NEUTRAL = "#D97706"; // same amber already used app-wide for "unlinked"
  // (NeedsAttention warning dot, previous chart's line color) — one flat
  // color across all buckets, not an escalating ramp, per the constraint
  // above: age alone doesn't make an unlinked transaction more urgent.
  const buckets = [
    { key: "0-7", name: "0-7 Hari", count: 0, totalAmount: ZERO, color: NEUTRAL, dateFrom: iso(daysAgo(7)), dateTo: iso(today) },
    { key: "8-30", name: "8-30 Hari", count: 0, totalAmount: ZERO, color: NEUTRAL, dateFrom: iso(daysAgo(30)), dateTo: iso(daysAgo(8)) },
    { key: "31-60", name: "31-60 Hari", count: 0, totalAmount: ZERO, color: NEUTRAL, dateFrom: iso(daysAgo(60)), dateTo: iso(daysAgo(31)) },
    { key: "60plus", name: ">60 Hari", count: 0, totalAmount: ZERO, color: NEUTRAL, dateFrom: null as string | null, dateTo: iso(daysAgo(61)) },
  ];

  for (const t of txns) {
    const daysOld = Math.floor((today.getTime() - t.transactionDate.getTime()) / 86_400_000);
    const bucket = daysOld <= 7 ? buckets[0] : daysOld <= 30 ? buckets[1] : daysOld <= 60 ? buckets[2] : buckets[3];
    bucket.count += 1;
    bucket.totalAmount = bucket.totalAmount.add(t.amount);
  }

  return buckets.map((b) => ({ ...b, totalAmount: Number(b.totalAmount) }));
}

export async function getReviewDistribution() {
  const rows = await prisma.financialTransaction.groupBy({
    by: ["reviewStatus"],
    where: { status: "ACTIVE" },
    _count: { _all: true },
  });
  const get = (s: string) => rows.find((r) => r.reviewStatus === s)?._count._all ?? 0;
  return [
    { key: "NORMAL", name: "Normal", value: get("NORMAL"), color: "#16A34A" },
    { key: "WARNING", name: "Warning", value: get("WARNING"), color: "#D97706" },
    { key: "REVIEW_REQUIRED", name: "Review Required", value: get("REVIEW_REQUIRED"), color: "#DC2626" },
  ];
}

// Outstanding invoice aging — buckets by days past dueDate so staff can
// prioritize collection by urgency, not just amount. Single query, same
// shape as outstandingTotal in getDashboardSummaryCards (fetch invoices +
// allocations, reduce in memory) — not a new aggregation pattern.
export async function getOutstandingAging() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const invoices = await prisma.invoice.findMany({
    where: { status: "ISSUED" },
    select: { totalAmount: true, dueDate: true, allocations: { where: { status: "ACTIVE" }, select: { amount: true } } },
  });

  const buckets = [
    { key: "current", name: "Belum Jatuh Tempo", value: ZERO, count: 0, color: "#16A34A" },
    { key: "1-30", name: "1-30 Hari", value: ZERO, count: 0, color: "#D97706" },
    { key: "31-60", name: "31-60 Hari", value: ZERO, count: 0, color: "#EA580C" },
    { key: "60plus", name: ">60 Hari", value: ZERO, count: 0, color: "#DC2626" },
  ];

  for (const inv of invoices) {
    const outstanding = inv.totalAmount.sub(sum(inv.allocations.map((a) => a.amount)));
    if (!outstanding.gt(0)) continue;

    const daysOverdue = inv.dueDate === null || inv.dueDate >= today ? -1 : Math.floor((today.getTime() - inv.dueDate.getTime()) / 86_400_000);
    const bucket = daysOverdue < 0 ? buckets[0] : daysOverdue <= 30 ? buckets[1] : daysOverdue <= 60 ? buckets[2] : buckets[3];
    bucket.value = bucket.value.add(outstanding);
    bucket.count += 1;
  }

  return buckets.map((b) => ({ ...b, value: Number(b.value) }));
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
