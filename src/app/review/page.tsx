import { getUnlinkedTransactions, getReviewRequiredTransactions } from "@/lib/reviewQueue";
import { UnlinkedReviewTable, ReviewRow } from "@/components/UnlinkedReviewTable";

// Step 16 — Unlinked / Review Screen. Merges two independent sets
// (UNLINKED per Step 6, WARNING/REVIEW_REQUIRED per Step 9) into one list,
// tagging each row with which set(s) it belongs to rather than collapsing
// them into a single status — a transaction can be UNLINKED and NORMAL
// (the common, valid, non-error case) at the same time.
export default async function ReviewPage() {
  const [unlinked, reviewRequired] = await Promise.all([getUnlinkedTransactions(), getReviewRequiredTransactions()]);

  const byId = new Map<string, ReviewRow>();
  for (const t of unlinked) {
    byId.set(t.id, {
      id: t.id,
      transactionDate: t.transactionDate,
      amount: t.amount.toString(), // Prisma.Decimal isn't serializable across the RSC boundary
      description: t.description,
      sourceType: t.sourceType,
      sourceReference: t.sourceReference,
      notes: t.notes,
      reviewStatus: t.reviewStatus,
      isUnlinked: true,
      clientName: null,
      matterName: null,
    });
  }
  for (const t of reviewRequired) {
    const existing = byId.get(t.id);
    if (existing) {
      existing.reviewStatus = t.reviewStatus;
    } else {
      byId.set(t.id, {
        id: t.id,
        transactionDate: t.transactionDate,
        amount: t.amount.toString(),
        description: t.description,
        sourceType: t.sourceType,
        sourceReference: t.sourceReference,
        notes: t.notes,
        reviewStatus: t.reviewStatus,
        isUnlinked: false,
        clientName: t.client?.name ?? null,
        matterName: t.matter?.matterName ?? null,
      });
    }
  }

  const rows = Array.from(byId.values()).sort((a, b) => +new Date(b.transactionDate) - +new Date(a.transactionDate));

  return (
    <div>
      <h1>Unlinked / Review</h1>
      <p style={{ opacity: 0.7 }}>
        Transaksi di bawah belum terhubung ke Client/Matter, atau perlu ditinjau. <strong>Membiarkan transaksi tetap Unlinked adalah aksi yang valid</strong> —
        tidak ada yang wajib di-link kalau memang belum diketahui pemiliknya.
      </p>
      <UnlinkedReviewTable rows={rows} />
    </div>
  );
}
