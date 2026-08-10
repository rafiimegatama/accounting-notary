import { prisma } from "./prisma";

// Shared by /api/sources and the /sources page (Section 20) — one
// implementation, not duplicated between the route handler and the page.
// source_type/source_reference live inline on financial_transaction and
// cost_detail (Step 10 decision), so this unions both rather than inventing
// a new FINANCIAL_SOURCE table just to back this screen.
export async function getSourcesList(limit = 100) {
  const [transactions, costDetails] = await Promise.all([
    prisma.financialTransaction.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true, sourceType: true, sourceReference: true, createdAt: true,
        client: { select: { id: true, name: true } },
        matter: { select: { id: true, matterName: true } },
        _count: { select: { attachments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.costDetail.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true, sourceType: true, sourceReference: true, createdAt: true,
        matter: { select: { id: true, matterName: true, client: { select: { id: true, name: true } } } },
        _count: { select: { attachments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const merged = [
    ...transactions.map((t) => ({
      id: t.id,
      entityType: "FINANCIAL_TRANSACTION" as const,
      sourceType: t.sourceType,
      sourceReference: t.sourceReference,
      client: t.client,
      matter: t.matter,
      createdAt: t.createdAt,
      attachmentCount: t._count.attachments,
    })),
    ...costDetails.map((c) => ({
      id: c.id,
      entityType: "COST_DETAIL" as const,
      sourceType: c.sourceType,
      sourceReference: c.sourceReference,
      client: c.matter.client,
      matter: { id: c.matter.id, matterName: c.matter.matterName },
      createdAt: c.createdAt,
      attachmentCount: c._count.attachments,
    })),
  ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return merged.slice(0, limit);
}
