import { prisma } from "./prisma";
import { formatCurrency, formatDate } from "./formatCurrency";

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

// P2.3 "Sources & Documents" on Matter Detail — the known, previously
// documented gap (SYSTEM_CONSISTENCY_REPORT.md check #1 WARNING): the
// Matter Position screen only ever showed attachments linked *directly* to
// the matter, not ones nested under its cost details/invoices/transactions.
// This walks the same four attachment FK columns FinancialAttachment
// already has (no schema change, no polymorphic redesign — see
// docs/PROJECT_RULES.md constraint 6) and merges them with context about
// which child entity each one actually came from.
export interface MatterSourceItem {
  attachmentId: string;
  fileName: string;
  fileType: string | null;
  uploadedAt: Date;
  origin: "MATTER" | "COST_DETAIL" | "INVOICE" | "TRANSACTION";
  originLabel: string;
  originHref: string | null;
}

export async function getMatterSourceSummary(matterId: string): Promise<MatterSourceItem[]> {
  const [direct, costDetails, invoices, transactions] = await Promise.all([
    prisma.financialAttachment.findMany({ where: { matterId } }),
    prisma.costDetail.findMany({ where: { matterId, status: "ACTIVE" }, include: { attachments: true } }),
    prisma.invoice.findMany({ where: { matterId, status: "ISSUED" }, include: { attachments: true } }),
    prisma.financialTransaction.findMany({ where: { matterId, status: "ACTIVE" }, include: { attachments: true } }),
  ]);

  const items: MatterSourceItem[] = [];
  for (const a of direct) {
    items.push({ attachmentId: a.id, fileName: a.fileName, fileType: a.fileType, uploadedAt: a.uploadedAt, origin: "MATTER", originLabel: "Matter (langsung)", originHref: null });
  }
  for (const c of costDetails) {
    for (const a of c.attachments) {
      items.push({
        attachmentId: a.id,
        fileName: a.fileName,
        fileType: a.fileType,
        uploadedAt: a.uploadedAt,
        origin: "COST_DETAIL",
        originLabel: `${c.category ?? "Rincian Biaya"} — ${formatCurrency(c.amount)}`,
        originHref: null, // no standalone cost-detail detail page exists — shown inline on the matter position itself
      });
    }
  }
  for (const inv of invoices) {
    for (const a of inv.attachments) {
      items.push({
        attachmentId: a.id,
        fileName: a.fileName,
        fileType: a.fileType,
        uploadedAt: a.uploadedAt,
        origin: "INVOICE",
        originLabel: `Invoice ${inv.invoiceNumber}`,
        originHref: `/invoices/${inv.id}`,
      });
    }
  }
  for (const t of transactions) {
    for (const a of t.attachments) {
      items.push({
        attachmentId: a.id,
        fileName: a.fileName,
        fileType: a.fileType,
        uploadedAt: a.uploadedAt,
        origin: "TRANSACTION",
        originLabel: `Transaction ${formatDate(t.transactionDate)} — ${formatCurrency(t.amount)}`,
        originHref: `/transactions/${t.id}`,
      });
    }
  }

  return items.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt));
}

// P2.4 "Sources / Documents [COUNT]" on Client Detail — deliberately
// lighter than the Matter version: a count plus a capped recent list, not
// a full per-item breakdown. Reuses the exact same FK columns (no schema
// change — this was explicitly conditional on "effort kecil", and walking
// one extra join level from Matter to Client is exactly that, not a
// redesign) so it was not deferred.
export interface ClientSourceItem {
  attachmentId: string;
  fileName: string;
  fileType: string | null;
  uploadedAt: Date;
  originLabel: string;
  originHref: string | null;
}

export async function getClientSourceSummary(clientId: string, limit = 10): Promise<{ count: number; recent: ClientSourceItem[] }> {
  const matters = await prisma.matter.findMany({ where: { clientId }, select: { id: true, matterName: true } });
  const matterIds = matters.map((m) => m.id);
  const matterNameById = new Map(matters.map((m) => [m.id, m.matterName]));

  const [direct, viaMatters, costDetails, invoices, transactions] = await Promise.all([
    prisma.financialAttachment.findMany({ where: { clientId } }),
    matterIds.length ? prisma.financialAttachment.findMany({ where: { matterId: { in: matterIds } } }) : Promise.resolve([]),
    matterIds.length ? prisma.costDetail.findMany({ where: { matterId: { in: matterIds }, status: "ACTIVE" }, include: { attachments: true } }) : Promise.resolve([]),
    matterIds.length ? prisma.invoice.findMany({ where: { matterId: { in: matterIds }, status: "ISSUED" }, include: { attachments: true } }) : Promise.resolve([]),
    prisma.financialTransaction.findMany({ where: { clientId, status: "ACTIVE" }, include: { attachments: true } }),
  ]);

  const items: ClientSourceItem[] = [];
  for (const a of direct) items.push({ attachmentId: a.id, fileName: a.fileName, fileType: a.fileType, uploadedAt: a.uploadedAt, originLabel: "Client (langsung)", originHref: null });
  for (const a of viaMatters) items.push({ attachmentId: a.id, fileName: a.fileName, fileType: a.fileType, uploadedAt: a.uploadedAt, originLabel: `Matter — ${matterNameById.get(a.matterId!) ?? ""}`, originHref: `/matters/${a.matterId}` });
  for (const c of costDetails) for (const a of c.attachments) items.push({ attachmentId: a.id, fileName: a.fileName, fileType: a.fileType, uploadedAt: a.uploadedAt, originLabel: `Rincian Biaya — ${matterNameById.get(c.matterId) ?? ""}`, originHref: `/matters/${c.matterId}` });
  for (const inv of invoices) for (const a of inv.attachments) items.push({ attachmentId: a.id, fileName: a.fileName, fileType: a.fileType, uploadedAt: a.uploadedAt, originLabel: `Invoice ${inv.invoiceNumber}`, originHref: `/invoices/${inv.id}` });
  for (const t of transactions) for (const a of t.attachments) items.push({ attachmentId: a.id, fileName: a.fileName, fileType: a.fileType, uploadedAt: a.uploadedAt, originLabel: `Transaction ${formatDate(t.transactionDate)}`, originHref: `/transactions/${t.id}` });

  // Same attachment can theoretically be reached twice only if it were
  // attached to two FKs at once, which the upload route never does (one
  // attachment = one FK) — dedupe by id anyway as a defensive guarantee,
  // not because it's expected to trigger.
  const seen = new Set<string>();
  const deduped = items.filter((i) => (seen.has(i.attachmentId) ? false : (seen.add(i.attachmentId), true)));
  deduped.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt));

  return { count: deduped.length, recent: deduped.slice(0, limit) };
}
