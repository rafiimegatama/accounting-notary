import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

// CSV export for Transaction History — Section 21 ("CSV if existing
// project supports it"). No PDF engine built, per the same section's
// explicit "do not build unless already available."
export async function GET(request: Request) {
  getCurrentUser(request);
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId") ?? undefined;
  const matterId = searchParams.get("matterId") ?? undefined;
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const transactions = await prisma.financialTransaction.findMany({
    where: {
      status: "ACTIVE",
      ...(clientId ? { clientId } : {}),
      ...(matterId ? { matterId } : {}),
      ...(dateFrom || dateTo
        ? { transactionDate: { gte: dateFrom ? new Date(dateFrom) : undefined, lte: dateTo ? new Date(dateTo) : undefined } }
        : {}),
    },
    include: { client: true, matter: true },
    orderBy: { transactionDate: "desc" },
  });

  const header = ["Date", "Direction", "Amount", "Description", "Client", "Matter", "Financial Type", "Review Status", "Source"];
  const rows = transactions.map((t) => [
    t.transactionDate.toISOString().slice(0, 10),
    t.direction,
    t.amount.toString(),
    csvEscape(t.description),
    csvEscape(t.client?.name ?? ""),
    csvEscape(t.matter?.matterName ?? ""),
    t.financialType,
    t.reviewStatus,
    t.sourceType,
  ]);
  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transaction-history-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
