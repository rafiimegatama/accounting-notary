import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { compareValues, type SortDir } from "@/lib/listSort";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortHeader } from "@/components/ui/SortHeader";

interface Filters {
  sort?: string;
  dir?: string;
}

const DEPOSIT_SORT_KEYS = ["date", "clientName", "matterName", "received", "remaining"] as const;
type DepositSortKey = (typeof DEPOSIT_SORT_KEYS)[number];

// Deposit Received/Used/Remaining always reads from backend-computed
// values (Step 7 formulas via src/lib/position.ts) — never
// `Deposit - Disbursement` computed independently here (Section 17).
export default async function DepositsPage({ searchParams }: { searchParams: Filters }) {
  const deposits = await prisma.deposit.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { transaction: { include: { client: true, matter: true } } },
  });

  // Per-matter remaining, reusing the exact same aggregation as Dashboard/Matter list.
  const { getMatterFinancialOverview } = await import("@/lib/dashboard");
  const matterOverview = await getMatterFinancialOverview(200);
  const remainingByMatter = new Map(matterOverview.map((m) => [m.id, m.depositRemaining]));

  // Sort is opt-in: no sort param leaves the existing createdAt-desc (from
  // the Prisma query above) untouched.
  const dir: SortDir = searchParams.dir === "asc" ? "asc" : "desc";
  const sortKey = searchParams.sort && (DEPOSIT_SORT_KEYS as readonly string[]).includes(searchParams.sort) ? (searchParams.sort as DepositSortKey) : null;
  if (sortKey) {
    deposits.sort((a, b) => {
      switch (sortKey) {
        case "clientName":
          return compareValues(a.transaction.client?.name ?? "", b.transaction.client?.name ?? "", dir);
        case "matterName":
          return compareValues(a.transaction.matter?.matterName ?? "", b.transaction.matter?.matterName ?? "", dir);
        case "received":
          return compareValues(Number(a.transaction.amount), Number(b.transaction.amount), dir);
        case "remaining": {
          const ra = a.transaction.matterId ? Number(remainingByMatter.get(a.transaction.matterId) ?? 0) : 0;
          const rb = b.transaction.matterId ? Number(remainingByMatter.get(b.transaction.matterId) ?? 0) : 0;
          return compareValues(ra, rb, dir);
        }
        case "date":
        default:
          return compareValues(a.transaction.transactionDate.getTime(), b.transaction.transactionDate.getTime(), dir);
      }
    });
  }
  const headerProps = { currentSort: sortKey ?? "date", currentDir: dir, basePath: "/deposits", queryParams: {} };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Deposits / Client Funds</h1>
        <p className="text-sm text-muted">Remaining dihitung backend (Deposit − Disbursement per matter), bukan angka independen di frontend.</p>
      </div>

      <Card>
        <CardBody className="p-0">
          {deposits.length === 0 ? (
            <EmptyState title="Belum ada deposit" description="Klasifikasikan transaksi sebagai Deposit dari halaman Transaction Detail." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <SortHeader label="Date" sortKey="date" defaultDir="desc" {...headerProps} />
                    <SortHeader label="Client" sortKey="clientName" defaultDir="asc" {...headerProps} />
                    <SortHeader label="Matter" sortKey="matterName" defaultDir="asc" {...headerProps} />
                    <SortHeader label="Received" sortKey="received" defaultDir="desc" align="right" {...headerProps} />
                    <SortHeader label="Remaining (Matter)" sortKey="remaining" defaultDir="desc" align="right" {...headerProps} />
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3">{formatDate(d.transaction.transactionDate)}</td>
                      <td className="px-5 py-3">
                        {d.transaction.client ? <a href={`/clients/${d.transaction.client.id}`} className="text-primary hover:underline">{d.transaction.client.name}</a> : "-"}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {d.transaction.matter ? <a href={`/matters/${d.transaction.matter.id}`} className="text-primary hover:underline">{d.transaction.matter.matterName}</a> : "-"}
                      </td>
                      <td className="px-5 py-3 text-right">{formatCurrency(d.transaction.amount)}</td>
                      <td className="px-5 py-3 text-right">{d.transaction.matterId ? formatCurrency(remainingByMatter.get(d.transaction.matterId) ?? 0) : "-"}</td>
                      <td className="px-5 py-3"><a href={`/transactions/${d.financialTransactionId}`} className="text-primary hover:underline">Trace →</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
