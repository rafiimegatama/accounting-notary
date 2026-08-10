import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

// Deposit Received/Used/Remaining always reads from backend-computed
// values (Step 7 formulas via src/lib/position.ts) — never
// `Deposit - Disbursement` computed independently here (Section 17).
export default async function DepositsPage() {
  const deposits = await prisma.deposit.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { transaction: { include: { client: true, matter: true } } },
  });

  // Per-matter remaining, reusing the exact same aggregation as Dashboard/Matter list.
  const { getMatterFinancialOverview } = await import("@/lib/dashboard");
  const matterOverview = await getMatterFinancialOverview(200);
  const remainingByMatter = new Map(matterOverview.map((m) => [m.id, m.depositRemaining]));

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
                    <th className="px-5 py-3">Date</th><th className="px-5 py-3">Client</th><th className="px-5 py-3">Matter</th>
                    <th className="px-5 py-3 text-right">Received</th><th className="px-5 py-3 text-right">Remaining (Matter)</th><th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3">{formatDate(d.transaction.transactionDate)}</td>
                      <td className="px-5 py-3">{d.transaction.client?.name ?? "-"}</td>
                      <td className="px-5 py-3 text-muted">{d.transaction.matter?.matterName ?? "-"}</td>
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
