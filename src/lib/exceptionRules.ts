import type { Prisma, PrismaClient } from "@prisma/client";
import { Prisma as PrismaNS } from "@prisma/client";
import { writeAuditLog } from "./audit";

type Tx = Prisma.TransactionClient | PrismaClient;

const ZERO = new PrismaNS.Decimal(0);
function sumDecimal(values: PrismaNS.Decimal[]): PrismaNS.Decimal {
  return values.reduce((acc, v) => acc.add(v), ZERO);
}

// Implements the Step 9 Rule Table (#1-4: partial payment / overpayment /
// multi-invoice allocation). This is deliberately NOT a rule engine — it
// is a fixed set of comparisons against flags the staff themselves set
// (invoice.allowPartialPayment), never a judgment the system invents.
// Called after every allocate/reverse-allocation mutation, inside the
// same transaction as that mutation.
export async function recomputeReviewStatus(tx: Tx, financialTransactionId: string, userId: string) {
  const transaction = await tx.financialTransaction.findUniqueOrThrow({
    where: { id: financialTransactionId },
    include: { payment: { include: { allocations: { where: { status: "ACTIVE" }, include: { invoice: true } } } } },
  });

  if (!transaction.payment) return; // rule table only applies to classified payments

  const allocations = transaction.payment.allocations;
  const totalAllocated = sumDecimal(allocations.map((a) => a.amount));

  // Collected as data, not mutated via closure — TS can't reliably narrow
  // a `let` reassigned inside a nested function, and this reads clearer anyway.
  const signals: { level: "WARNING" | "REVIEW_REQUIRED"; why: string }[] = [];

  if (totalAllocated.gt(transaction.amount)) {
    signals.push({ level: "REVIEW_REQUIRED", why: "Total alokasi melebihi jumlah payment." });
  } else if (totalAllocated.lt(transaction.amount)) {
    signals.push({ level: "WARNING", why: "Sebagian payment belum dialokasikan." });
  }

  const invoiceGroups = new Map<string, PrismaNS.Decimal>();
  for (const a of allocations) {
    if (!a.invoiceId) continue;
    invoiceGroups.set(a.invoiceId, (invoiceGroups.get(a.invoiceId) ?? ZERO).add(a.amount));
  }
  for (const [invoiceId, allocatedToInvoice] of invoiceGroups) {
    const invoice = allocations.find((a) => a.invoiceId === invoiceId)!.invoice!;
    if (allocatedToInvoice.gt(invoice.totalAmount)) {
      signals.push({ level: "REVIEW_REQUIRED", why: `Overpayment pada invoice ${invoice.invoiceNumber}.` });
    } else if (allocatedToInvoice.lt(invoice.totalAmount) && !invoice.allowPartialPayment) {
      signals.push({ level: "REVIEW_REQUIRED", why: `Partial payment pada invoice ${invoice.invoiceNumber} yang tidak mengizinkan partial payment.` });
    }
  }

  const worst: "NORMAL" | "WARNING" | "REVIEW_REQUIRED" = signals.some((s) => s.level === "REVIEW_REQUIRED")
    ? "REVIEW_REQUIRED"
    : signals.some((s) => s.level === "WARNING")
    ? "WARNING"
    : "NORMAL";

  // Manual REVIEW_REQUIRED flags (e.g. suspected duplicate, Step 9 rule #6)
  // are never silently downgraded by this automatic recomputation.
  if (transaction.reviewStatus === "REVIEW_REQUIRED" && worst !== "REVIEW_REQUIRED") {
    return;
  }

  if (worst === transaction.reviewStatus) return; // no-op: don't log a "change" that didn't happen

  await tx.financialTransaction.update({
    where: { id: financialTransactionId },
    data: { reviewStatus: worst },
  });
  // Step 22 consistency check caught this: an automatic status change is
  // still a financial mutation and must be audited like any manual one.
  await writeAuditLog(tx, {
    entityType: "FINANCIAL_TRANSACTION",
    entityId: financialTransactionId,
    action: "STATUS_CHANGE",
    userId,
    previousValue: { reviewStatus: transaction.reviewStatus },
    newValue: { reviewStatus: worst },
    reason: signals.length > 0 ? signals.map((s) => s.why).join(" ") : "Sepenuhnya teralokasi — kembali normal.",
  });
}
