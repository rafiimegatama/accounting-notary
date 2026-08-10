import { prisma } from "./prisma";

// Step 18 — Search. Matches the master prompt's own example precisely:
// searching "PT ABC" (a client name) must return that client's matters,
// transactions, cost details, and invoices — not just a text hit on the
// client row itself. So this isn't plain full-text search: a client/matter
// name match EXPANDS to everything under it, unioned with direct text/
// amount/date/id matches on the other entities.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseAmount(q: string): number | null {
  const cleaned = q.replace(/[^\d]/g, "");
  if (!cleaned || !/^[\d.,]+$/.test(q)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDate(q: string): { start: Date; end: Date } | null {
  const d = new Date(q);
  if (isNaN(d.getTime()) || !/\d{4}/.test(q)) return null;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return { start, end };
}

export async function searchAll(rawQuery: string) {
  const q = rawQuery.trim();
  if (!q) return { clients: [], matters: [], transactions: [], invoices: [], costDetails: [] };

  const isUuid = UUID_RE.test(q);
  const amount = parseAmount(q);
  const dateRange = parseDate(q);

  const matchedClients = await prisma.client.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    take: 10,
  });
  const matchedMatters = await prisma.matter.findMany({
    where: { matterName: { contains: q, mode: "insensitive" } },
    include: { client: { select: { id: true, name: true } } },
    take: 10,
  });

  const relevantClientIds = Array.from(new Set([...matchedClients.map((c) => c.id), ...matchedMatters.map((m) => m.clientId)]));
  const mattersOfMatchedClients = relevantClientIds.length
    ? await prisma.matter.findMany({ where: { clientId: { in: relevantClientIds } }, include: { client: { select: { id: true, name: true } } } })
    : [];

  const matterMap = new Map(mattersOfMatchedClients.map((m) => [m.id, m]));
  for (const m of matchedMatters) matterMap.set(m.id, m);
  const relevantMatterIds = Array.from(matterMap.keys());

  const [transactions, invoices, costDetails] = await Promise.all([
    prisma.financialTransaction.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { description: { contains: q, mode: "insensitive" } },
          { sourceReference: { contains: q, mode: "insensitive" } },
          { clientId: { in: relevantClientIds } },
          { matterId: { in: relevantMatterIds } },
          ...(isUuid ? [{ id: q }] : []),
          ...(amount !== null ? [{ amount }] : []),
          ...(dateRange ? [{ transactionDate: { gte: dateRange.start, lt: dateRange.end } }] : []),
        ],
      },
      include: { client: { select: { id: true, name: true } }, matter: { select: { id: true, matterName: true } } },
      orderBy: { transactionDate: "desc" },
      take: 50,
    }),
    prisma.invoice.findMany({
      where: {
        OR: [
          { invoiceNumber: { contains: q, mode: "insensitive" } },
          { matterId: { in: relevantMatterIds } },
        ],
      },
      include: { matter: { include: { client: { select: { id: true, name: true } } } } },
      take: 30,
    }),
    prisma.costDetail.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { description: { contains: q, mode: "insensitive" } },
          { matterId: { in: relevantMatterIds } },
        ],
      },
      include: { matter: { select: { id: true, matterName: true } } },
      take: 30,
    }),
  ]);

  return {
    clients: matchedClients,
    matters: Array.from(matterMap.values()),
    transactions,
    invoices,
    costDetails,
  };
}
