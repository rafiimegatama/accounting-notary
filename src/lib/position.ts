import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// All formulas here implement Step 7 (Client/Matter Financial Position),
// updated per the status columns introduced in Step 11:
//   - financial_transaction / payment_allocation rows with status other
//     than ACTIVE are excluded from every sum.
//   - invoice.status here is lifecycle-only (DRAFT/ISSUED/VOID) — Total
//     Invoice counts ISSUED only. payment_status (UNPAID/PARTIALLY_PAID/
//     PAID/OVERPAID) is derived per-invoice below, never stored.

const ZERO = new Prisma.Decimal(0);

function sumDecimal(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((acc, v) => acc.add(v), ZERO);
}

async function computeTransactionBucket(where: { matterId: string } | { clientId: string; matterId: null }) {
  const transactions = await prisma.financialTransaction.findMany({
    where: { ...where, status: "ACTIVE" },
    include: {
      payment: { include: { allocations: { where: { status: "ACTIVE" } } } },
      deposit: true,
      disbursement: true,
    },
    orderBy: { transactionDate: "asc" },
  });

  const paymentRows = transactions.filter((t) => t.financialType === "PAYMENT" && t.payment);
  const paymentBreakdown = paymentRows.map((t) => {
    const allocated = sumDecimal(t.payment!.allocations.map((a) => a.amount));
    return {
      transactionId: t.id,
      date: t.transactionDate,
      amount: t.amount,
      allocated,
      unallocated: t.amount.sub(allocated),
      reviewStatus: t.reviewStatus,
    };
  });
  const totalPayment = sumDecimal(paymentRows.map((t) => t.amount));
  const unallocatedAmount = sumDecimal(paymentBreakdown.map((p) => p.unallocated));

  const depositRows = transactions.filter((t) => t.financialType === "DEPOSIT" && t.deposit);
  const depositReceived = sumDecimal(depositRows.map((t) => t.amount));

  const disbursementRows = transactions.filter((t) => t.financialType === "DISBURSEMENT" && t.disbursement);
  const depositUsed = sumDecimal(disbursementRows.map((t) => t.amount));

  return {
    summary: {
      totalPayment,
      unallocatedAmount,
      depositReceived,
      depositUsed,
      depositRemaining: depositReceived.sub(depositUsed),
      disbursementTotal: depositUsed,
    },
    detail: {
      payments: paymentBreakdown,
      deposits: depositRows.map((t) => ({ transactionId: t.id, date: t.transactionDate, amount: t.amount })),
      disbursements: disbursementRows.map((t) => ({
        transactionId: t.id,
        date: t.transactionDate,
        amount: t.amount,
        category: t.disbursement!.category,
      })),
    },
  };
}

export async function getMatterFinancialPosition(matterId: string) {
  const matter = await prisma.matter.findUniqueOrThrow({
    where: { id: matterId },
    include: { client: { select: { id: true, name: true } } },
  });

  const costDetails = await prisma.costDetail.findMany({
    where: { matterId, status: "ACTIVE" },
    orderBy: { costDate: "asc" },
  });
  const totalCost = sumDecimal(costDetails.map((c) => c.amount));

  const invoices = await prisma.invoice.findMany({
    where: { matterId, status: "ISSUED" },
    include: { allocations: { where: { status: "ACTIVE" } } },
    orderBy: { invoiceDate: "asc" },
  });
  const invoiceBreakdown = invoices.map((inv) => {
    const allocated = sumDecimal(inv.allocations.map((a) => a.amount));
    const outstanding = inv.totalAmount.sub(allocated);
    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      totalAmount: inv.totalAmount,
      allocated,
      outstanding,
      // Derived, not stored — see Step 9/11 formula notes.
      paymentStatus: outstanding.lte(0)
        ? outstanding.lt(0)
          ? "OVERPAID"
          : "PAID"
        : allocated.gt(0)
        ? "PARTIALLY_PAID"
        : "UNPAID",
    };
  });
  const totalInvoice = sumDecimal(invoices.map((i) => i.totalAmount));
  const outstanding = sumDecimal(invoiceBreakdown.map((b) => b.outstanding));

  const bucket = await computeTransactionBucket({ matterId });

  return {
    matter,
    summary: { totalCost, totalInvoice, outstanding, ...bucket.summary },
    detail: { costDetails, invoices: invoiceBreakdown, ...bucket.detail },
  };
}

export async function getClientFinancialPosition(clientId: string) {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const matters = await prisma.matter.findMany({ where: { clientId }, select: { id: true, matterName: true, status: true } });

  const matterPositions = await Promise.all(matters.map((m) => getMatterFinancialPosition(m.id)));

  // Transactions linked to this client but not yet to a specific matter
  // (the LINKED_TO_CLIENT intermediate state from Step 6) — these exist
  // and must be visible, but don't roll up under any matter.
  const unassignedBucket = await computeTransactionBucket({ clientId, matterId: null });

  const summary = matterPositions.reduce(
    (acc, mp) => ({
      totalCost: acc.totalCost.add(mp.summary.totalCost),
      totalInvoice: acc.totalInvoice.add(mp.summary.totalInvoice),
      outstanding: acc.outstanding.add(mp.summary.outstanding),
      totalPayment: acc.totalPayment.add(mp.summary.totalPayment),
      unallocatedAmount: acc.unallocatedAmount.add(mp.summary.unallocatedAmount),
      depositReceived: acc.depositReceived.add(mp.summary.depositReceived),
      depositUsed: acc.depositUsed.add(mp.summary.depositUsed),
      depositRemaining: acc.depositRemaining.add(mp.summary.depositRemaining),
      disbursementTotal: acc.disbursementTotal.add(mp.summary.disbursementTotal),
    }),
    {
      totalCost: ZERO, totalInvoice: ZERO, outstanding: ZERO, totalPayment: unassignedBucket.summary.totalPayment,
      unallocatedAmount: unassignedBucket.summary.unallocatedAmount,
      depositReceived: unassignedBucket.summary.depositReceived,
      depositUsed: unassignedBucket.summary.depositUsed,
      depositRemaining: unassignedBucket.summary.depositRemaining,
      disbursementTotal: unassignedBucket.summary.disbursementTotal,
    }
  );

  return {
    client,
    summary,
    matterBreakdown: matterPositions.map((mp) => ({
      matterId: mp.matter.id,
      matterName: mp.matter.matterName,
      status: mp.matter.status,
      summary: mp.summary,
    })),
    unassignedToMatter: unassignedBucket.detail,
  };
}
