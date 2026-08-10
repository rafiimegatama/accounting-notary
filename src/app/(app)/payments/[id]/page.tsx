import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AllocateInline, ReverseAllocationButton } from "@/components/TransactionActions";

const ZERO = new Prisma.Decimal(0);

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    include: {
      transaction: { include: { client: true, matter: true, attachments: true } },
      allocations: { include: { invoice: true } },
    },
  });
  if (!payment) notFound();

  const activeAllocations = payment.allocations.filter((a) => a.status === "ACTIVE");
  const allocated = activeAllocations.reduce((a, x) => a.add(x.amount), ZERO);
  const unallocated = payment.transaction.amount.sub(allocated);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Payment — {formatCurrency(payment.transaction.amount)}</h1>
        <p className="text-sm text-muted">
          {payment.transaction.client?.name ?? "Unlinked"}{payment.transaction.matter ? ` / ${payment.transaction.matter.matterName}` : ""}
          {" · "}<a href={`/transactions/${payment.financialTransactionId}`} className="text-primary hover:underline">Lihat transaksi →</a>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Amount" value={formatCurrency(payment.transaction.amount)} />
        <Stat label="Allocated" value={formatCurrency(allocated)} />
        <Stat label="Unallocated" value={formatCurrency(unallocated)} />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Allocations</h2>
          {unallocated.gt(0) && <AllocateInline paymentId={payment.id} unallocated={formatCurrency(unallocated)} />}
        </CardHeader>
        <CardBody className="p-0">
          {activeAllocations.length === 0 ? (
            <EmptyState title="Belum ada alokasi" />
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs font-medium text-muted"><th className="px-5 py-2.5">Invoice</th><th className="px-5 py-2.5">Type</th><th className="px-5 py-2.5 text-right">Amount</th><th className="px-5 py-2.5"></th></tr></thead>
              <tbody>
                {activeAllocations.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5">{a.invoice ? <a href={`/invoices/${a.invoice.id}`} className="text-primary hover:underline">{a.invoice.invoiceNumber}</a> : "-"}</td>
                    <td className="px-5 py-2.5 text-muted">{a.allocationType}</td>
                    <td className="px-5 py-2.5 text-right">{formatCurrency(a.amount)}</td>
                    <td className="px-5 py-2.5"><ReverseAllocationButton allocationId={a.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-text">Source</h2></CardHeader>
        <CardBody>
          <p className="text-sm text-text">{payment.transaction.sourceType}{payment.transaction.sourceReference ? ` — ${payment.transaction.sourceReference}` : ""}</p>
          {payment.transaction.attachments.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {payment.transaction.attachments.map((a) => <li key={a.id}>{a.fileName} <span className="text-xs text-muted">({formatDate(a.uploadedAt)})</span></li>)}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-border bg-white px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-text">{value}</div>
    </div>
  );
}
