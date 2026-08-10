import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/formatCurrency";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PaymentStatusBadge, GenericStatusBadge } from "@/components/ui/StatusBadge";
import { describeTimelineEvent } from "@/lib/timelineLabel";

const ZERO = new Prisma.Decimal(0);

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      matter: { include: { client: true } },
      allocations: { include: { payment: { include: { transaction: true } } } },
    },
  });
  if (!invoice) notFound();

  const [costDetails, attachments, audit] = await Promise.all([
    prisma.costDetail.findMany({ where: { invoiceId: invoice.id, status: "ACTIVE" }, orderBy: { costDate: "asc" } }),
    prisma.financialAttachment.findMany({ where: { invoiceId: invoice.id } }),
    prisma.auditLog.findMany({ where: { entityType: "INVOICE", entityId: invoice.id }, orderBy: { occurredAt: "desc" } }),
  ]);

  const activeAllocations = invoice.allocations.filter((a) => a.status === "ACTIVE");
  const allocated = activeAllocations.reduce((a, x) => a.add(x.amount), ZERO);
  const outstanding = invoice.totalAmount.sub(allocated);
  const paymentStatus = outstanding.lte(0) ? (outstanding.lt(0) ? "OVERPAID" : "PAID") : allocated.gt(0) ? "PARTIALLY_PAID" : "UNPAID";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-muted">
            <a href={`/clients/${invoice.matter.client.id}`} className="hover:text-primary">{invoice.matter.client.name}</a>
            {" / "}
            <a href={`/matters/${invoice.matter.id}`} className="hover:text-primary">{invoice.matter.matterName}</a>
          </p>
          <div className="mt-2 flex gap-2">
            <GenericStatusBadge status={invoice.status} />
            <PaymentStatusBadge status={paymentStatus} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={formatCurrency(invoice.totalAmount)} />
        <Stat label="Allocated" value={formatCurrency(allocated)} />
        <Stat label="Outstanding" value={formatCurrency(outstanding)} />
        <Stat label="Partial Payment" value={invoice.allowPartialPayment ? "Diizinkan" : "Tidak diizinkan"} />
      </div>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-text">Cost Details</h2></CardHeader>
        <CardBody className="p-0">
          {costDetails.length === 0 ? (
            <EmptyState title="Belum ada cost detail yang ditagih di invoice ini" />
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs font-medium text-muted"><th className="px-5 py-2.5">Date</th><th className="px-5 py-2.5">Description</th><th className="px-5 py-2.5 text-right">Amount</th></tr></thead>
              <tbody>
                {costDetails.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5">{formatDate(c.costDate)}</td>
                    <td className="px-5 py-2.5">{c.description}</td>
                    <td className="px-5 py-2.5 text-right">{formatCurrency(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-text">Payments &amp; Allocations</h2></CardHeader>
        <CardBody className="p-0">
          {activeAllocations.length === 0 ? (
            <EmptyState title="Belum ada payment yang dialokasikan" />
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs font-medium text-muted"><th className="px-5 py-2.5">Date</th><th className="px-5 py-2.5 text-right">Allocated Amount</th><th className="px-5 py-2.5"></th></tr></thead>
              <tbody>
                {activeAllocations.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5">{formatDate(a.payment.transaction.transactionDate)}</td>
                    <td className="px-5 py-2.5 text-right">{formatCurrency(a.amount)}</td>
                    <td className="px-5 py-2.5"><a href={`/transactions/${a.payment.financialTransactionId}`} className="text-primary hover:underline">Trace →</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-text">Document / Source</h2></CardHeader>
        <CardBody>
          {attachments.length === 0 ? <EmptyState title="Belum ada dokumen terlampir" /> : (
            <ul className="space-y-2 text-sm">
              {attachments.map((a) => <li key={a.id}>{a.fileName} <span className="text-xs text-muted">({formatDate(a.uploadedAt)})</span></li>)}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-text">Timeline</h2></CardHeader>
        <CardBody>
          {audit.length === 0 ? <EmptyState title="Belum ada riwayat" /> : (
            <ul className="space-y-4">
              {audit.map((a) => (
                <li key={a.id} className="border-l-2 border-border pl-3">
                  <div className="text-xs text-muted">{formatDateTime(a.occurredAt)} · {a.userId}</div>
                  <div className="text-sm text-text">{describeTimelineEvent(a)}</div>
                </li>
              ))}
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
