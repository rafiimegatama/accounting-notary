import { formatCurrency, formatDate, formatDateTime } from "@/lib/formatCurrency";
import { describeTimelineEvent } from "@/lib/timelineLabel";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReviewStatusBadge, PaymentStatusBadge, GenericStatusBadge } from "@/components/ui/StatusBadge";

// Step 15 (rebuilt Section 40 "signature screen"). Server component:
// "every summary value must be clickable" is satisfied with plain anchor
// links (<a href="#section">) into detail cards already rendered on the
// same page — no fetch-on-click, no hidden data.

type Money = { toString(): string };

type CostDetailRow = { id: string; costDate: Date; description: string; category: string | null; amount: Money; sourceType: string; status: string };
type InvoiceRow = { invoiceId: string; invoiceNumber: string; totalAmount: Money; allocated: Money; outstanding: Money; paymentStatus: string };
type PaymentRow = { transactionId: string; date: Date; amount: Money; allocated: Money; unallocated: Money; reviewStatus: string };
type DepositRow = { transactionId: string; date: Date; amount: Money };
type DisbursementRow = { transactionId: string; date: Date; amount: Money; category: string | null };
type AttachmentRow = { id: string; fileName: string; fileType: string | null; uploadedAt: Date };
type HistoryRow = { id: string; entityType: string; action: string; userId: string; occurredAt: Date; reason: string | null; newValue: unknown };
type MatterSummaryRow = { matterId: string; matterName: string; status: string; summary: Record<string, Money> };

export interface FinancialPositionViewProps {
  scope: "MATTER" | "CLIENT";
  title: string;
  subtitle?: string;
  status: string;
  summary: {
    totalCost: Money;
    totalInvoice: Money;
    outstanding: Money;
    totalPayment: Money;
    unallocatedAmount: Money;
    depositReceived: Money;
    depositUsed: Money;
    depositRemaining: Money;
    disbursementTotal: Money;
  };
  costDetails?: CostDetailRow[];
  invoices?: InvoiceRow[];
  payments: PaymentRow[];
  deposits: DepositRow[];
  disbursements: DisbursementRow[];
  attachments: AttachmentRow[];
  history: HistoryRow[];
  matterBreakdown?: MatterSummaryRow[];
  linkHref: (kind: "matter" | "transaction", id: string) => string;
  actions?: React.ReactNode;
}

function SummaryStat({ label, value, href }: { label: string; value: Money; href: string }) {
  return (
    <a href={href} className="rounded-control border border-border bg-white px-4 py-3 transition-colors hover:border-primary/50">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-text">{formatCurrency(value)}</div>
    </a>
  );
}

export function FinancialPositionView(props: FinancialPositionViewProps) {
  const { summary } = props;
  const costInvoiceHref = props.scope === "CLIENT" ? "#matter-breakdown" : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">{props.title}</h1>
          {props.subtitle && <p className="text-sm text-muted">{props.subtitle}</p>}
          <div className="mt-2"><GenericStatusBadge status={props.status} /></div>
        </div>
        {props.actions && <div className="flex gap-2">{props.actions}</div>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Total Cost" value={summary.totalCost} href={costInvoiceHref ?? "#cost-detail"} />
        <SummaryStat label="Total Invoice" value={summary.totalInvoice} href={costInvoiceHref ?? "#invoices"} />
        <SummaryStat label="Total Payment" value={summary.totalPayment} href="#payments" />
        <SummaryStat label="Outstanding" value={summary.outstanding} href={costInvoiceHref ?? "#invoices"} />
        <SummaryStat label="Unallocated" value={summary.unallocatedAmount} href="#payments" />
        <SummaryStat label="Deposit Received" value={summary.depositReceived} href="#deposits" />
        <SummaryStat label="Deposit Used" value={summary.depositUsed} href="#disbursements" />
        <SummaryStat label="Deposit Remaining" value={summary.depositRemaining} href="#deposits" />
      </div>

      {props.matterBreakdown && (
        <Card id="matter-breakdown">
          <CardHeader>
            <h2 className="text-sm font-semibold text-text">Per Matter</h2>
            <p className="mt-0.5 text-xs text-muted">Drill-down Total Cost/Invoice/Outstanding tingkat client — klik matter untuk rincian penuh.</p>
          </CardHeader>
          <CardBody className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-5 py-2.5">Matter</th><th className="px-5 py-2.5">Status</th><th className="px-5 py-2.5 text-right">Outstanding</th><th className="px-5 py-2.5 text-right">Deposit Remaining</th>
                </tr>
              </thead>
              <tbody>
                {props.matterBreakdown.map((m) => (
                  <tr key={m.matterId} className="border-b border-border last:border-0 hover:bg-bg">
                    <td className="px-5 py-2.5"><a href={props.linkHref("matter", m.matterId)} className="font-medium text-text hover:text-primary">{m.matterName}</a></td>
                    <td className="px-5 py-2.5"><GenericStatusBadge status={m.status} /></td>
                    <td className="px-5 py-2.5 text-right">{formatCurrency(m.summary.outstanding)}</td>
                    <td className="px-5 py-2.5 text-right">{formatCurrency(m.summary.depositRemaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {props.costDetails && (
        <Card id="cost-detail">
          <CardHeader><h2 className="text-sm font-semibold text-text">Cost Detail</h2></CardHeader>
          <CardBody className="p-0">
            {props.costDetails.length === 0 ? (
              <EmptyState title="Belum ada rincian biaya" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-5 py-2.5">Date</th><th className="px-5 py-2.5">Description</th><th className="px-5 py-2.5">Category</th><th className="px-5 py-2.5 text-right">Amount</th><th className="px-5 py-2.5">Source</th><th className="px-5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {props.costDetails.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-2.5">{formatDate(c.costDate)}</td>
                      <td className="px-5 py-2.5">{c.description}</td>
                      <td className="px-5 py-2.5 text-muted">{c.category ?? "-"}</td>
                      <td className="px-5 py-2.5 text-right">{formatCurrency(c.amount)}</td>
                      <td className="px-5 py-2.5 text-muted">{c.sourceType}</td>
                      <td className="px-5 py-2.5"><GenericStatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}

      {props.invoices && (
        <Card id="invoices">
          <CardHeader><h2 className="text-sm font-semibold text-text">Invoice</h2></CardHeader>
          <CardBody className="p-0">
            {props.invoices.length === 0 ? (
              <EmptyState title="Belum ada invoice" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-5 py-2.5">Invoice</th><th className="px-5 py-2.5 text-right">Total</th><th className="px-5 py-2.5 text-right">Allocated</th><th className="px-5 py-2.5 text-right">Outstanding</th><th className="px-5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {props.invoices.map((inv) => (
                    <tr key={inv.invoiceId} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-2.5"><a href={`/invoices/${inv.invoiceId}`} className="font-medium text-text hover:text-primary">{inv.invoiceNumber}</a></td>
                      <td className="px-5 py-2.5 text-right">{formatCurrency(inv.totalAmount)}</td>
                      <td className="px-5 py-2.5 text-right">{formatCurrency(inv.allocated)}</td>
                      <td className="px-5 py-2.5 text-right font-medium">{formatCurrency(inv.outstanding)}</td>
                      <td className="px-5 py-2.5"><PaymentStatusBadge status={inv.paymentStatus as "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}

      <Card id="payments">
        <CardHeader>
          <h2 className="text-sm font-semibold text-text">Payment{props.scope === "CLIENT" ? " (belum ter-assign ke matter)" : ""}</h2>
          {props.scope === "CLIENT" && <p className="mt-0.5 text-xs text-muted">Payment yang sudah ter-assign ke matter ada di halaman matter masing-masing.</p>}
        </CardHeader>
        <CardBody className="p-0">
          {props.payments.length === 0 ? (
            <EmptyState title="Belum ada payment" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-5 py-2.5">Date</th><th className="px-5 py-2.5 text-right">Amount</th><th className="px-5 py-2.5 text-right">Allocated</th><th className="px-5 py-2.5 text-right">Unallocated</th><th className="px-5 py-2.5">Status</th><th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {props.payments.map((p) => (
                  <tr key={p.transactionId} className="border-b border-border last:border-0 hover:bg-bg">
                    <td className="px-5 py-2.5">{formatDate(p.date)}</td>
                    <td className="px-5 py-2.5 text-right">{formatCurrency(p.amount)}</td>
                    <td className="px-5 py-2.5 text-right">{formatCurrency(p.allocated)}</td>
                    <td className="px-5 py-2.5 text-right">{formatCurrency(p.unallocated)}</td>
                    <td className="px-5 py-2.5"><ReviewStatusBadge status={p.reviewStatus as "NORMAL" | "WARNING" | "REVIEW_REQUIRED"} /></td>
                    <td className="px-5 py-2.5"><a href={props.linkHref("transaction", p.transactionId)} className="text-primary hover:underline">Trace →</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card id="deposits">
        <CardHeader>
          <h2 className="text-sm font-semibold text-text">Deposit / Funds</h2>
          <p className="mt-0.5 text-xs text-muted">
            Received {formatCurrency(summary.depositReceived)} · Used {formatCurrency(summary.depositUsed)} · Remaining {formatCurrency(summary.depositRemaining)}
          </p>
        </CardHeader>
        <CardBody className="p-0">
          {props.deposits.length === 0 ? (
            <EmptyState title="Belum ada deposit" />
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs font-medium text-muted"><th className="px-5 py-2.5">Date</th><th className="px-5 py-2.5 text-right">Amount</th></tr></thead>
              <tbody>
                {props.deposits.map((d) => (
                  <tr key={d.transactionId} className="border-b border-border last:border-0 hover:bg-bg">
                    <td className="px-5 py-2.5">{formatDate(d.date)}</td><td className="px-5 py-2.5 text-right">{formatCurrency(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card id="disbursements">
        <CardHeader><h2 className="text-sm font-semibold text-text">Disbursement</h2></CardHeader>
        <CardBody className="p-0">
          {props.disbursements.length === 0 ? (
            <EmptyState title="Belum ada disbursement" />
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs font-medium text-muted"><th className="px-5 py-2.5">Date</th><th className="px-5 py-2.5">Category</th><th className="px-5 py-2.5 text-right">Amount</th></tr></thead>
              <tbody>
                {props.disbursements.map((d) => (
                  <tr key={d.transactionId} className="border-b border-border last:border-0 hover:bg-bg">
                    <td className="px-5 py-2.5">{formatDate(d.date)}</td><td className="px-5 py-2.5 text-muted">{d.category ?? "-"}</td><td className="px-5 py-2.5 text-right">{formatCurrency(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card id="sources">
        <CardHeader><h2 className="text-sm font-semibold text-text">Document / Source</h2></CardHeader>
        <CardBody>
          {props.attachments.length === 0 ? (
            <EmptyState title="Belum ada dokumen pendukung" />
          ) : (
            <ul className="space-y-2">
              {props.attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M13 2v7h7" /></svg>
                  <span className="text-text">{a.fileName}</span>
                  <span className="text-xs text-muted">({a.fileType ?? "file"}, diunggah {formatDate(a.uploadedAt)})</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">
            Catatan: daftar ini hanya dokumen yang terlampir langsung ke {props.scope === "MATTER" ? "matter" : "client"} ini — dokumen pada cost detail/invoice/transaksi individual ada di masing-masing detailnya.
          </p>
        </CardBody>
      </Card>

      <Card id="timeline">
        <CardHeader><h2 className="text-sm font-semibold text-text">Timeline</h2></CardHeader>
        <CardBody>
          {props.history.length === 0 ? (
            <EmptyState title="Belum ada riwayat aktivitas" />
          ) : (
            <ul className="space-y-4">
              {props.history.map((h) => (
                <li key={h.id} className="border-l-2 border-border pl-3">
                  <div className="text-xs text-muted">{formatDateTime(h.occurredAt)} · {h.userId}</div>
                  <div className="text-sm text-text">{describeTimelineEvent(h)}</div>
                  {h.reason && <div className="text-xs text-muted">Alasan: {h.reason}</div>}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
