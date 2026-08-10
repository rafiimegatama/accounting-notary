import { prisma } from "@/lib/prisma";
import { UnlinkedReviewTable, ReviewRow } from "@/components/UnlinkedReviewTable";

// Section 19 — Review Center. Deliberately NOT an error queue: only
// WARNING/REVIEW_REQUIRED transactions appear here. UNLINKED-but-NORMAL
// transactions are excluded on purpose (they have their own filter under
// /transactions?linked=unlinked) — being unlinked is not, by itself, a
// reason to review something (Principle 5).
export default async function ReviewPage() {
  const transactions = await prisma.financialTransaction.findMany({
    where: { status: "ACTIVE", reviewStatus: { in: ["WARNING", "REVIEW_REQUIRED"] } },
    include: { client: { select: { id: true, name: true } }, matter: { select: { id: true, matterName: true } } },
    orderBy: { transactionDate: "desc" },
  });

  const latestReasons = await prisma.auditLog.findMany({
    where: { entityType: "FINANCIAL_TRANSACTION", entityId: { in: transactions.map((t) => t.id) }, action: "STATUS_CHANGE" },
    orderBy: { occurredAt: "desc" },
    distinct: ["entityId"],
  });
  const reasonByTxn = new Map(latestReasons.map((r) => [r.entityId, r.reason]));

  const rows: ReviewRow[] = transactions.map((t) => ({
    id: t.id,
    transactionDate: t.transactionDate,
    amount: t.amount.toString(),
    description: t.description,
    sourceType: t.sourceType,
    sourceReference: t.sourceReference,
    notes: t.notes,
    reviewStatus: t.reviewStatus as "WARNING" | "REVIEW_REQUIRED",
    clientName: t.client?.name ?? null,
    matterName: t.matter?.matterName ?? null,
    reason: reasonByTxn.get(t.id) ?? null,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Review Center</h1>
        <p className="text-sm text-muted">Items yang membutuhkan perhatian. Status ini advisory — tidak memblokir link, alokasi, atau workflow apapun.</p>
      </div>
      <UnlinkedReviewTable rows={rows} />
    </div>
  );
}
