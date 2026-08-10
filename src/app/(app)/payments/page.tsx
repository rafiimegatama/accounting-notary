import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

const ZERO = new Prisma.Decimal(0);

export default async function PaymentsPage() {
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: {
      transaction: { include: { client: true, matter: true } },
      allocations: { where: { status: "ACTIVE" }, include: { invoice: { select: { invoiceNumber: true } } } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Payments</h1>
        <p className="text-sm text-muted">Satu payment bisa dialokasikan ke lebih dari satu invoice.</p>
      </div>

      <Card>
        <CardBody className="p-0">
          {payments.length === 0 ? (
            <EmptyState title="Belum ada payment" description="Klasifikasikan transaksi sebagai Payment dari halaman Transaction Detail." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3">Matter</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3 text-right">Allocated</th>
                    <th className="px-5 py-3 text-right">Unallocated</th>
                    <th className="px-5 py-3">Invoice(s)</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const allocated = p.allocations.reduce((a, x) => a.add(x.amount), ZERO);
                    const unallocated = p.transaction.amount.sub(allocated);
                    return (
                      <tr key={p.id} className="border-b border-border last:border-0 hover:bg-bg">
                        <td className="px-5 py-3">{formatDate(p.transaction.transactionDate)}</td>
                        <td className="px-5 py-3">{p.transaction.client?.name ?? "-"}</td>
                        <td className="px-5 py-3 text-muted">{p.transaction.matter?.matterName ?? "-"}</td>
                        <td className="px-5 py-3 text-right"><a href={`/payments/${p.id}`} className="font-medium text-text hover:text-primary">{formatCurrency(p.transaction.amount)}</a></td>
                        <td className="px-5 py-3 text-right">{formatCurrency(allocated)}</td>
                        <td className="px-5 py-3 text-right">{formatCurrency(unallocated)}</td>
                        <td className="px-5 py-3 text-muted">{p.allocations.map((a) => a.invoice?.invoiceNumber).filter(Boolean).join(", ") || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
