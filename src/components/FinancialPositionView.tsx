import { formatCurrency, formatDate, formatDateTime } from "@/lib/formatCurrency";
import { describeTimelineEvent } from "@/lib/timelineLabel";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReviewStatusBadge, PaymentStatusBadge, GenericStatusBadge } from "@/components/ui/StatusBadge";
import { FieldHelp } from "@/components/ui/FieldHelp";
import { FIELD_HELP } from "@/lib/fieldHelp";
import { CalculationExplain, FormulaRows, ListBreakdown } from "@/components/ui/CalculationExplain";
import { computeAllocatedAmount } from "@/lib/summaryDerived";
import { PrintReportButton } from "@/components/PrintReportButton";
import { BRANDING_TEXT_DEFAULTS } from "@/lib/branding";

// Step 15 (rebuilt Section 40 "signature screen"). Server component:
// "every summary value must be clickable" is satisfied with plain anchor
// links (<a href="#section">) into detail cards already rendered on the
// same page — no fetch-on-click, no hidden data.

type Money = { toString(): string };

type CostDetailRow = { id: string; costDate: Date; description: string; category: string | null; amount: Money; sourceType: string; status: string };
type InvoiceRow = { invoiceId: string; invoiceNumber: string; totalAmount: Money; allocated: Money; outstanding: Money; paymentStatus: string };
type PaymentRow = { transactionId: string; date: Date; amount: Money; allocated: Money; unallocated: Money; reviewStatus: string };
type DepositRow = { transactionId: string; date: Date; amount: Money };
// Roadmap #3 — bankAccount is additive to `category` (what the money was
// spent on), not a replacement; null when classified without picking a
// funding account (bankAccountId is optional, linkage never forced).
type DisbursementRow = {
  transactionId: string;
  date: Date;
  amount: Money;
  category: string | null;
  bankAccount: { bankName: string; accountName: string | null } | null;
};
type AttachmentRow = {
  id: string;
  fileName: string;
  fileType: string | null;
  uploadedAt: Date;
  // Present only for the MATTER-scope aggregated view (P2.3) — origin
  // tells the user which child entity (cost detail/invoice/transaction)
  // this attachment actually came from, vs. being attached directly.
  originLabel?: string;
  originHref?: string | null;
};
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
  // When set and larger than attachments.length, the list is a capped
  // "recent" view (P2.4 Client scope) rather than the full set (Matter
  // scope always passes the full set, so this stays undefined there).
  attachmentsTotalCount?: number;
  history: HistoryRow[];
  matterBreakdown?: MatterSummaryRow[];
  // Domain Refinement (Steps 4/6-10): presentation-only, same source as the
  // Dashboard's chart toggle (ui_lite_mode cookie). No formula changes —
  // lite mode picks a subset of the same already-computed summary values
  // and hides the formula-caption box; every section below (Cost Detail,
  // Invoice, Payment, Deposit, Disbursement, Sources, Timeline) still
  // renders in full regardless of this flag (Step 9: no feature removal).
  liteMode?: boolean;
  // Live office branding (v25 print header) — optional so callers that
  // haven't fetched it yet still compile; falls back to the compile-time
  // default text (see the print-only header block below) rather than
  // showing nothing.
  brandingEyebrow?: string;
  linkHref: (kind: "matter" | "transaction", id: string) => string;
  actions?: React.ReactNode;
}

// `help`, when present, wires FIELD_HELP copy through a FieldHelp trigger
// ("what does this mean," top-right "(?)" icon). `explain`, when present, is
// the separate "Bagaimana dihitung?" (Calculation Transparency, "how was
// this calculated") disclosure — a CalculationExplain trigger rendered as a
// third line below the value. Both are rendered as SIBLINGS of the <a> (not
// descendants) so a click on either never fires the tile's own drill-down
// navigation — nesting an interactive <button> inside an <a> would also be
// invalid HTML, so the border/padding live on the outer wrapper and the <a>
// only covers the label+value rows.
function SummaryStat({
  label,
  value,
  href,
  help,
  explain,
}: {
  label: string;
  value: Money;
  href: string;
  help?: string;
  explain?: React.ReactNode;
}) {
  return (
    <div className="relative rounded-control border border-border bg-white px-4 py-3 transition-colors hover:border-primary/50">
      <a href={href} className="block">
        <div className="text-xs font-medium text-muted">{label}</div>
        <div className="mt-1 text-lg font-semibold text-text">{formatCurrency(value)}</div>
      </a>
      {/* Cetak Laporan (print stylesheet): "?" and "Bagaimana dihitung?"
          triggers are interactive-only disclosures, not part of the printed
          financial summary — hide just these two wrapper elements, the
          FieldHelp/CalculationExplain components themselves stay untouched. */}
      {explain && <div className="mt-1 print:hidden">{explain}</div>}
      {help && (
        <span className="absolute right-2 top-2 print:hidden">
          <FieldHelp content={help} ariaLabel={`Penjelasan ${label}`} />
        </span>
      )}
    </div>
  );
}

export function FinancialPositionView(props: FinancialPositionViewProps) {
  const { summary } = props;
  const costInvoiceHref = props.scope === "CLIENT" ? "#matter-breakdown" : undefined;
  const allocatedToInvoices = computeAllocatedAmount(Number(summary.totalInvoice.toString()), Number(summary.outstanding.toString()));
  // "Allocated" = Total Payment − Unallocated (the Unallocated formula
  // rearranged), same figure the Payment table's TOTAL row already needs —
  // computed once here (see src/lib/summaryDerived.ts) and reused in both
  // places so it can never drift.
  const allocatedToPayments = computeAllocatedAmount(Number(summary.totalPayment.toString()), Number(summary.unallocatedAmount.toString()));

  // Client scope's Payment/Deposit/Disbursement sections below only ever
  // show the "linked to client but not yet to a matter" bucket (see
  // clients/[id]/page.tsx) — the same caveat already printed above the
  // Payment card is repeated inside these popovers so the list of rows
  // shown there is never mistaken for the full set behind the headline
  // total (which, for Client scope, also rolls up every matter).
  const clientScopeNote =
    props.scope === "CLIENT" ? (
      <p className="mb-1.5 text-muted">Menampilkan yang belum ter-assign ke matter — sisanya ada di halaman matter masing-masing.</p>
    ) : null;

  const costExplain = props.costDetails ? (
    <CalculationExplain title="Rincian Biaya" ariaLabel="Lihat cara perhitungan Rincian Biaya">
      <ListBreakdown
        rows={props.costDetails.map((c) => ({ key: c.id, label: `${formatDate(c.costDate)} — ${c.description}`, value: formatCurrency(c.amount) }))}
        emptyLabel="Belum ada rincian biaya."
        moreHref="#cost-detail"
      />
    </CalculationExplain>
  ) : (
    <CalculationExplain title="Rincian Biaya" ariaLabel="Lihat cara perhitungan Rincian Biaya">
      <p className="text-muted">
        Rincian Biaya adalah gabungan dari seluruh matter pada client ini.{" "}
        <a href={costInvoiceHref} className="text-primary hover:underline">Lihat breakdown per matter →</a>
      </p>
    </CalculationExplain>
  );

  const invoiceExplain = props.invoices ? (
    <CalculationExplain title="Total Invoice" ariaLabel="Lihat cara perhitungan Total Invoice">
      <ListBreakdown
        rows={props.invoices.map((inv) => ({ key: inv.invoiceId, label: inv.invoiceNumber, value: formatCurrency(inv.totalAmount), href: `/invoices/${inv.invoiceId}` }))}
        emptyLabel="Belum ada invoice."
        moreHref="#invoices"
      />
    </CalculationExplain>
  ) : (
    <CalculationExplain title="Total Invoice" ariaLabel="Lihat cara perhitungan Total Invoice">
      <p className="text-muted">
        Total Invoice adalah gabungan dari seluruh matter pada client ini.{" "}
        <a href={costInvoiceHref} className="text-primary hover:underline">Lihat breakdown per matter →</a>
      </p>
    </CalculationExplain>
  );

  const paymentExplain = (
    <CalculationExplain title="Total Payment" ariaLabel="Lihat cara perhitungan Total Payment">
      {clientScopeNote}
      <ListBreakdown
        rows={props.payments.map((p) => ({ key: p.transactionId, label: formatDate(p.date), value: formatCurrency(p.amount), href: props.linkHref("transaction", p.transactionId) }))}
        emptyLabel="Belum ada payment."
        moreHref="#payments"
      />
    </CalculationExplain>
  );

  const outstandingExplain = (
    <CalculationExplain title="Outstanding" ariaLabel="Lihat cara perhitungan Outstanding" align="right">
      <FormulaRows
        rows={[
          { label: "Total Invoice", value: formatCurrency(summary.totalInvoice), href: costInvoiceHref ?? "#invoices" },
          { label: "− Allocated", value: formatCurrency(allocatedToInvoices), href: costInvoiceHref ?? "#invoices" },
        ]}
        resultLabel="Outstanding"
        resultValue={formatCurrency(summary.outstanding)}
      />
    </CalculationExplain>
  );

  const unallocatedExplain = (
    <CalculationExplain title="Unallocated" ariaLabel="Lihat cara perhitungan Unallocated">
      <FormulaRows
        rows={[
          { label: "Total Payment", value: formatCurrency(summary.totalPayment), href: "#payments" },
          { label: "− Allocated", value: formatCurrency(allocatedToPayments), href: "#payments" },
        ]}
        resultLabel="Unallocated"
        resultValue={formatCurrency(summary.unallocatedAmount)}
      />
    </CalculationExplain>
  );

  const depositReceivedExplain = (
    <CalculationExplain title="Deposit Received" ariaLabel="Lihat cara perhitungan Deposit Received">
      {clientScopeNote}
      <ListBreakdown
        rows={props.deposits.map((d) => ({ key: d.transactionId, label: formatDate(d.date), value: formatCurrency(d.amount) }))}
        emptyLabel="Belum ada transaksi deposit."
        moreHref="#deposits"
      />
    </CalculationExplain>
  );

  const depositUsedExplain = (
    <CalculationExplain title="Deposit Used" ariaLabel="Lihat cara perhitungan Deposit Used" align="right">
      {clientScopeNote}
      <p className="mb-1.5 text-muted">
        Total dari seluruh disbursement pada {props.scope === "CLIENT" ? "client" : "matter"} ini — bukan pelacakan per deposit spesifik (tidak ada linkage 1:1 antara satu deposit dan satu disbursement).
      </p>
      <ListBreakdown
        rows={props.disbursements.map((d) => ({ key: d.transactionId, label: `${formatDate(d.date)}${d.category ? " — " + d.category : ""}`, value: formatCurrency(d.amount) }))}
        emptyLabel="Belum ada disbursement."
        moreHref="#disbursements"
      />
    </CalculationExplain>
  );

  const depositRemainingExplain = (
    <CalculationExplain title="Deposit Remaining" ariaLabel="Lihat cara perhitungan Deposit Remaining" align="right">
      <FormulaRows
        rows={[
          { label: "Deposit Received", value: formatCurrency(summary.depositReceived), href: "#deposits" },
          { label: "− Deposit Used", value: formatCurrency(summary.depositUsed), href: "#disbursements" },
        ]}
        resultLabel="Deposit Remaining"
        resultValue={formatCurrency(summary.depositRemaining)}
      />
    </CalculationExplain>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Print-only: shown exclusively inside window.print() output (the
          `hidden print:block` pair is the inverse of `print:hidden` used
          everywhere else on this page) — a minimal report header so the
          printed page has a title/timestamp even though the on-screen
          page title (browser chrome) doesn't survive to paper. Timestamp
          reflects this render, which for these Server Components is always
          per-request (the (app) layout reads cookies() via requireSession(),
          forcing dynamic rendering) — close enough to "printed at" without
          a dedicated client-side clock component. */}
      <div className="hidden print:block">
        <p className="text-sm font-semibold text-text">{props.brandingEyebrow ?? BRANDING_TEXT_DEFAULTS.branding_hero_eyebrow} — Laporan Posisi Keuangan</p>
        <p className="text-xs text-muted">Dicetak pada: {formatDateTime(new Date())}</p>
      </div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">{props.title}</h1>
          {props.subtitle && <p className="text-sm text-muted">{props.subtitle}</p>}
          <div className="mt-2"><GenericStatusBadge status={props.status} /></div>
        </div>
        <div className="flex gap-2 print:hidden">
          {props.actions}
          <PrintReportButton />
        </div>
      </div>

      {props.liteMode ? (
        <>
          {/* Step 10 mental model: Rincian Biaya -> Invoice -> Sudah Dibayar
              -> Outstanding. "Sudah Dibayar" reuses allocatedToInvoices —
              the exact same figure the Advanced formula caption already
              shows, not a new calculation. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat
              label="Rincian Biaya"
              value={summary.totalCost}
              href={costInvoiceHref ?? "#cost-detail"}
              help={FIELD_HELP.costAmount}
            />
            <SummaryStat label="Invoice" value={summary.totalInvoice} href={costInvoiceHref ?? "#invoices"} help={FIELD_HELP.invoiceTotal} />
            <SummaryStat label="Sudah Dibayar" value={allocatedToInvoices} href={costInvoiceHref ?? "#invoices"} />
            <SummaryStat label="Outstanding" value={summary.outstanding} href={costInvoiceHref ?? "#invoices"} />
          </div>
          {/* Step 6: Deposit is never a primary KPI in Lite Mode — shown as
              a small secondary line only when there actually is one, never
              an empty card. Advanced mode is unaffected (full Deposit card
              further down the page always renders regardless of this). */}
          {Number(summary.depositReceived.toString()) > 0 && (
            <a href="#deposits" className="flex w-fit items-center gap-2 rounded-control border border-border bg-white px-3 py-2 text-xs text-muted transition-colors hover:border-primary/50 hover:text-text">
              <span className="font-medium text-text">Uang Titipan</span>
              <span>{formatCurrency(summary.depositRemaining)} tersisa</span>
              <span className="text-primary">lihat detail →</span>
            </a>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat
              label="Rincian Biaya"
              value={summary.totalCost}
              href={costInvoiceHref ?? "#cost-detail"}
              help={FIELD_HELP.costAmount}
              explain={costExplain}
            />
            <SummaryStat label="Total Invoice" value={summary.totalInvoice} href={costInvoiceHref ?? "#invoices"} help={FIELD_HELP.invoiceTotal} explain={invoiceExplain} />
            <SummaryStat label="Total Payment" value={summary.totalPayment} href="#payments" explain={paymentExplain} />
            <SummaryStat label="Outstanding" value={summary.outstanding} href={costInvoiceHref ?? "#invoices"} explain={outstandingExplain} />
            <SummaryStat label="Unallocated" value={summary.unallocatedAmount} href="#payments" explain={unallocatedExplain} />
            {/* Deposit Used is every Disbursement-classified transaction for
                this matter, not scoped to money drawn from an actual
                deposit (position.ts: depositUsed === disbursementTotal,
                same number). Showing "Deposit Remaining" for a matter that
                never had a deposit produces a confusing negative number
                (Received 0 − Used X = −X) that reads like the client owes
                deposit money back, when nothing like that happened — found
                from a real accountant's (Tami) UAT questions. Same
                depositReceived>0 threshold already used to hide this block
                in Lite Mode below; the disbursement total itself remains
                visible either way in the Disbursement card further down.
                Deliberately hides all three (Received/Used/Remaining)
                together, not just Remaining — Used's label is only
                accurate in the context of an actual deposit existing. */}
            {Number(summary.depositReceived.toString()) > 0 && (
              <>
                <SummaryStat label="Deposit Received" value={summary.depositReceived} href="#deposits" explain={depositReceivedExplain} />
                <SummaryStat label="Deposit Used" value={summary.depositUsed} href="#disbursements" help={FIELD_HELP.depositUsed} explain={depositUsedExplain} />
                <SummaryStat label="Deposit Remaining" value={summary.depositRemaining} href="#deposits" explain={depositRemainingExplain} />
              </>
            )}
          </div>
        </>
      )}

      {props.matterBreakdown && (
        <Card id="matter-breakdown">
          <CardHeader>
            <h2 className="text-sm font-semibold text-text">Per Matter</h2>
            <p className="mt-0.5 text-xs text-muted">Drill-down Rincian Biaya/Invoice/Outstanding tingkat client — klik matter untuk rincian penuh.</p>
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
                    {/* "—" (not a misleading negative number) when this matter never had a
                        deposit — see the KPI-tile comment above for why. */}
                    <td className="px-5 py-2.5 text-right">
                      {Number(m.summary.depositReceived.toString()) > 0 ? formatCurrency(m.summary.depositRemaining) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {props.costDetails && (
        <Card id="cost-detail">
          <CardHeader><h2 className="text-sm font-semibold text-text">Rincian Biaya</h2></CardHeader>
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
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold text-text">
                    <td className="px-5 py-2.5" colSpan={3}>TOTAL</td>
                    <td className="px-5 py-2.5 text-right">{formatCurrency(summary.totalCost)}</td>
                    <td className="px-5 py-2.5" colSpan={2} />
                  </tr>
                </tfoot>
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
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold text-text">
                    <td className="px-5 py-2.5">TOTAL</td>
                    <td className="px-5 py-2.5 text-right">{formatCurrency(summary.totalInvoice)}</td>
                    <td className="px-5 py-2.5 text-right">{formatCurrency(allocatedToInvoices)}</td>
                    <td className="px-5 py-2.5 text-right">{formatCurrency(summary.outstanding)}</td>
                    <td className="px-5 py-2.5" />
                  </tr>
                </tfoot>
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
              <tfoot>
                <tr className="border-t-2 border-border font-semibold text-text">
                  <td className="px-5 py-2.5">TOTAL</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(summary.totalPayment)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(allocatedToPayments)}</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(summary.unallocatedAmount)}</td>
                  <td className="px-5 py-2.5" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </CardBody>
      </Card>

      <Card id="deposits">
        <CardHeader>
          <h2 className="text-sm font-semibold text-text">Deposit / Funds</h2>
          <p className="mt-0.5 text-xs text-muted">
            {Number(summary.depositReceived.toString()) > 0
              ? `Received ${formatCurrency(summary.depositReceived)} · Used ${formatCurrency(summary.depositUsed)} · Remaining ${formatCurrency(summary.depositRemaining)}`
              : "Belum ada deposit tercatat untuk ini — Deposit hanya dipakai kalau dana memang diperlakukan sebagai titipan client."}
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
              <tfoot>
                <tr className="border-t-2 border-border font-semibold text-text">
                  <td className="px-5 py-2.5">TOTAL</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(summary.depositReceived)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardBody>
      </Card>

      <Card id="disbursements">
        <CardHeader>
          <h2 className="text-sm font-semibold text-text">Disbursement</h2>
          <p className="mt-0.5 text-xs text-muted">
            Pencatatan di sini bersifat opsional dan tidak wajib sama nilainya dengan Rincian Biaya — sistem tidak
            menghitung otomatis selisih antara keduanya sebagai pendapatan/margin, ini murni catatan uang yang
            benar-benar keluar.
          </p>
        </CardHeader>
        <CardBody className="p-0">
          {props.disbursements.length === 0 ? (
            <EmptyState title="Belum ada disbursement" />
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs font-medium text-muted"><th className="px-5 py-2.5">Date</th><th className="px-5 py-2.5">Category</th><th className="px-5 py-2.5">Bank Account</th><th className="px-5 py-2.5 text-right">Amount</th></tr></thead>
              <tbody>
                {props.disbursements.map((d) => (
                  <tr key={d.transactionId} className="border-b border-border last:border-0 hover:bg-bg">
                    <td className="px-5 py-2.5">{formatDate(d.date)}</td><td className="px-5 py-2.5 text-muted">{d.category ?? "-"}</td><td className="px-5 py-2.5 text-muted">{d.bankAccount ? [d.bankAccount.bankName, d.bankAccount.accountName].filter(Boolean).join(" — ") : "-"}</td><td className="px-5 py-2.5 text-right">{formatCurrency(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold text-text">
                  <td className="px-5 py-2.5" colSpan={3}>TOTAL</td>
                  <td className="px-5 py-2.5 text-right">{formatCurrency(summary.disbursementTotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardBody>
      </Card>

      {/* Cetak Laporan: Sources & Documents is operational (raw attachment
          links, internal origin labels) — not part of the clean financial
          summary handed to the notary, hidden entirely for print. */}
      <Card id="sources" className="print:hidden">
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Sources & Documents</h2>
          {props.attachmentsTotalCount !== undefined && (
            <span className="rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-muted">{props.attachmentsTotalCount}</span>
          )}
        </CardHeader>
        <CardBody>
          {props.attachments.length === 0 ? (
            <EmptyState title="Belum ada dokumen pendukung" />
          ) : (
            <ul className="space-y-2">
              {props.attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M13 2v7h7" /></svg>
                  <div>
                    {a.originLabel && (
                      <div className="text-xs font-medium text-muted">
                        {a.originHref ? <a href={a.originHref} className="hover:text-primary hover:underline">{a.originLabel}</a> : a.originLabel}
                      </div>
                    )}
                    <a href={`/api/attachments/${a.id}`} className="text-primary hover:underline">{a.fileName}</a>{" "}
                    <span className="text-xs text-muted">({a.fileType ?? "file"}, diunggah {formatDate(a.uploadedAt)})</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {props.attachmentsTotalCount !== undefined && props.attachmentsTotalCount > props.attachments.length && (
            <p className="mt-3 text-xs text-muted">
              Menampilkan {props.attachments.length} terbaru dari total {props.attachmentsTotalCount} dokumen.
            </p>
          )}
        </CardBody>
      </Card>

      {/* Cetak Laporan: Timeline is internal/operational (staff names, audit
          reasons) — not something to hand to the notary, hidden for print. */}
      <Card id="timeline" className="print:hidden">
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
