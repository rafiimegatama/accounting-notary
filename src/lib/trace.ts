import { prisma } from "./prisma";
import type { AuditEntityType } from "./enums";

// Implements Step 8 — Transaction Trace. Multi-entry (TRANSACTION / PAYMENT /
// INVOICE / COST_DETAIL) per the validated finding that staff also trace
// starting from cost detail ("dari rincian biaya juga", pain #20).

export type TraceEntryType = "TRANSACTION" | "PAYMENT" | "INVOICE" | "COST_DETAIL";

export async function resolveTransactionIds(entryType: TraceEntryType, entryId: string): Promise<string[]> {
  switch (entryType) {
    case "TRANSACTION":
      return [entryId];
    case "PAYMENT": {
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: entryId } });
      return [payment.financialTransactionId];
    }
    case "INVOICE": {
      const allocations = await prisma.paymentAllocation.findMany({
        where: { invoiceId: entryId, status: "ACTIVE" },
        include: { payment: true },
      });
      return Array.from(new Set(allocations.map((a) => a.payment.financialTransactionId)));
    }
    case "COST_DETAIL": {
      const cost = await prisma.costDetail.findUniqueOrThrow({ where: { id: entryId } });
      if (!cost.invoiceId) return [];
      return resolveTransactionIds("INVOICE", cost.invoiceId);
    }
  }
}

// Gathers audit_log rows across every entity in this transaction's chain
// (transaction itself, its classification record, each active allocation,
// its own attachments) and merges them into one chronological timeline —
// see Step 8 "Timeline" design: no separate FINANCIAL_EVENT table exists,
// this traversal is the mechanism that replaces it.
async function buildTimeline(transactionId: string, paymentId: string | null, allocationIds: string[]) {
  const attachments = await prisma.financialAttachment.findMany({ where: { transactionId } });

  const targets: { entityType: AuditEntityType; entityId: string }[] = [
    { entityType: "FINANCIAL_TRANSACTION", entityId: transactionId },
    ...(paymentId ? [{ entityType: "PAYMENT" as const, entityId: paymentId }] : []),
    ...allocationIds.map((id) => ({ entityType: "PAYMENT_ALLOCATION" as const, entityId: id })),
    ...attachments.map((a) => ({ entityType: "FINANCIAL_ATTACHMENT" as const, entityId: a.id })),
  ];

  const rows = await prisma.auditLog.findMany({
    where: { OR: targets.map((t) => ({ entityType: t.entityType, entityId: t.entityId })) },
    orderBy: { occurredAt: "asc" },
  });

  return rows;
}

export async function buildTransactionTrace(transactionId: string) {
  const transaction = await prisma.financialTransaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: {
      client: true,
      matter: true,
      payment: { include: { allocations: { where: { status: "ACTIVE" }, include: { invoice: true } } } },
      deposit: true,
      disbursement: true,
      attachments: true,
    },
  });

  const allocations = transaction.payment?.allocations ?? [];
  const invoiceIds = Array.from(
    new Set(allocations.filter((a) => a.invoiceId).map((a) => a.invoiceId as string))
  );
  const costDetails = invoiceIds.length
    ? await prisma.costDetail.findMany({ where: { invoiceId: { in: invoiceIds } } })
    : [];

  const timeline = await buildTimeline(
    transactionId,
    transaction.payment?.id ?? null,
    allocations.map((a) => a.id)
  );

  return {
    transaction: {
      id: transaction.id,
      date: transaction.transactionDate,
      amount: transaction.amount,
      direction: transaction.direction,
      description: transaction.description,
    },
    // Node presence is conditional — absent nodes are simply omitted/null,
    // never fabricated. See Step 8 node table.
    nodes: {
      source: {
        sourceType: transaction.sourceType,
        sourceReference: transaction.sourceReference,
        attachments: transaction.attachments,
      },
      client: transaction.client,
      matter: transaction.matter,
      classification:
        transaction.financialType === "UNCLASSIFIED"
          ? null
          : { type: transaction.financialType, amount: transaction.amount },
      allocations: allocations.map((a) => ({
        allocationId: a.id,
        invoiceId: a.invoiceId,
        invoiceNumber: a.invoice?.invoiceNumber ?? null,
        allocationType: a.allocationType,
        amount: a.amount,
      })),
      costDetails,
      disbursement: transaction.disbursement,
    },
    currentStatus: {
      linkStatus: !transaction.clientId ? "UNLINKED" : !transaction.matterId ? "LINKED_TO_CLIENT" : "LINKED_TO_MATTER",
      reviewStatus: transaction.reviewStatus,
      financialType: transaction.financialType,
      transactionStatus: transaction.status,
    },
    timeline,
  };
}
