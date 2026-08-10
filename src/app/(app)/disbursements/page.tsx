import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function DisbursementsPage() {
  const disbursements = await prisma.disbursement.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { transaction: { include: { client: true, matter: true } } },
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Disbursements</h1>
        <p className="text-sm text-muted">Pengeluaran atas nama client, mis. pembayaran BPHTB/PNBP dari uang titipan.</p>
      </div>

      <Card>
        <CardBody className="p-0">
          {disbursements.length === 0 ? (
            <EmptyState title="Belum ada disbursement" description="Klasifikasikan transaksi (direction OUT) sebagai Disbursement dari halaman Transaction Detail." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-5 py-3">Date</th><th className="px-5 py-3">Client</th><th className="px-5 py-3">Matter</th>
                    <th className="px-5 py-3">Category</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3">Source</th><th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {disbursements.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3">{formatDate(d.transaction.transactionDate)}</td>
                      <td className="px-5 py-3">{d.transaction.client?.name ?? "-"}</td>
                      <td className="px-5 py-3 text-muted">{d.transaction.matter?.matterName ?? "-"}</td>
                      <td className="px-5 py-3">{d.category ?? "-"}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(d.transaction.amount)}</td>
                      <td className="px-5 py-3 text-muted">{d.transaction.sourceType}</td>
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
