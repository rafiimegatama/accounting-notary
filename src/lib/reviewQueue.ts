import { prisma } from "./prisma";

// Backs the Unlinked/Review screen (Step 16). Deliberately two separate
// queries, not one combined filter — UNLINKED and REVIEW_REQUIRED are
// different axes (Step 6 vs Step 9) and a transaction can be neither, either,
// or both. The page merges/dedupes them for display but the underlying
// query keeps the distinction visible via which set(s) each row came from.
export async function getUnlinkedTransactions() {
  return prisma.financialTransaction.findMany({
    where: { status: "ACTIVE", clientId: null, matterId: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function getReviewRequiredTransactions() {
  return prisma.financialTransaction.findMany({
    where: { status: "ACTIVE", reviewStatus: { in: ["WARNING", "REVIEW_REQUIRED"] } },
    include: { client: { select: { id: true, name: true } }, matter: { select: { id: true, matterName: true } } },
    orderBy: { createdAt: "desc" },
  });
}
