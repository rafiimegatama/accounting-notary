import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PaymentStatusBadge } from "@/components/ui/StatusBadge";

const ZERO = new Prisma.Decimal(0);

export default async function InvoicesPage() {
  const invoices = await prisma.invoice.findMany({
    where: { status: "ISSUED" },
    orderBy: { invoiceDate: "desc" },
    take: 150,
    include: { matter: { include: { client: true } }, allocations: { where: { status: "ACTIVE" } } },
  });

  const rows = invoices.map((inv) => {
    const allocated = inv.allocations.reduce((a, x) => a.add(x.amount), ZERO);
    const outstanding = inv.totalAmount.sub(allocated);
    const paymentStatus = outstanding.lte(0) ? (outstanding.lt(0) ? "OVERPAID" : "PAID") : allocated.gt(0) ? "PARTIALLY_PAID" : "UNPAID";
    return { ...inv, allocated, outstanding, paymentStatus: paymentStatus as "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID" };
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Invoices</h1>
        <p className="text-sm text-muted">Payment status dihitung backend dari total invoice dan alokasi aktif — bukan diasumsikan frontend.</p>
      </div>

      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <EmptyState title="Belum ada invoice" description="Buat invoice pertama dari halaman Matter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-5 py-3">Invoice Number</th>
                    <th className="px-5 py-3">Matter</th>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3">Invoice Date</th>
                    <th className="px-5 py-3">Due Date</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-right">Allocated</th>
                    <th className="px-5 py-3 text-right">Outstanding</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inv) => (
                    <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3"><a href={`/invoices/${inv.id}`} className="font-medium text-text hover:text-primary">{inv.invoiceNumber}</a></td>
                      <td className="px-5 py-3"><a href={`/matters/${inv.matterId}`} className="text-muted hover:text-primary">{inv.matter.matterName}</a></td>
                      <td className="px-5 py-3 text-muted">{inv.matter.client.name}</td>
                      <td className="px-5 py-3">{formatDate(inv.invoiceDate)}</td>
                      <td className="px-5 py-3 text-muted">{inv.dueDate ? formatDate(inv.dueDate) : "-"}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(inv.totalAmount)}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(inv.allocated)}</td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(inv.outstanding)}</td>
                      <td className="px-5 py-3"><PaymentStatusBadge status={inv.paymentStatus} /></td>
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
