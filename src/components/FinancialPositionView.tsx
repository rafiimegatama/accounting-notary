import { formatCurrency, formatDate, formatDateTime } from "@/lib/formatCurrency";

// Step 15 — Financial Position UI. Server component (no client JS needed):
// "every summary value must be clickable" is satisfied with plain anchor
// links (<a href="#section">) into detail tables that are already rendered
// on the same page — no fetch-on-click, no hidden data, nothing hidden
// behind an interaction the user has to discover.

type Money = { toString(): string };

type CostDetailRow = { id: string; costDate: Date; description: string; category: string | null; amount: Money; sourceType: string; status: string };
type InvoiceRow = { invoiceId: string; invoiceNumber: string; totalAmount: Money; allocated: Money; outstanding: Money; paymentStatus: string };
type PaymentRow = { transactionId: string; date: Date; amount: Money; allocated: Money; unallocated: Money; reviewStatus: string };
type DepositRow = { transactionId: string; date: Date; amount: Money };
type DisbursementRow = { transactionId: string; date: Date; amount: Money; category: string | null };
type AttachmentRow = { id: string; fileName: string; fileType: string | null; uploadedAt: Date };
type HistoryRow = { id: string; entityType: string; action: string; userId: string; occurredAt: Date; reason: string | null };
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
  // Optional: for CLIENT scope these are omitted (undefined) rather than
  // passed as incomplete arrays — cost detail/invoice only exist per-matter
  // in the schema, so a client-level list would either be misleadingly
  // partial or require merging every matter's rows. Per-Matter Breakdown
  // is the correct drill-down for client-level Total Cost/Invoice/Outstanding.
  costDetails?: CostDetailRow[];
  invoices?: InvoiceRow[];
  payments: PaymentRow[];
  deposits: DepositRow[];
  disbursements: DisbursementRow[];
  attachments: AttachmentRow[];
  history: HistoryRow[];
  matterBreakdown?: MatterSummaryRow[]; // CLIENT scope only — Scenario 4/5: per-matter split
  linkHref: (kind: "matter" | "transaction", id: string) => string;
}

function SummaryCard({ label, value, href }: { label: string; value: Money; href: string }) {
  return (
    <a href={href} style={{ display: "block", border: "1px solid #ddd", borderRadius: 8, padding: "12px 16px", textDecoration: "none", color: "inherit" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{formatCurrency(value)}</div>
    </a>
  );
}

export function FinancialPositionView(props: FinancialPositionViewProps) {
  const { summary } = props;
  const costInvoiceHref = props.scope === "CLIENT" ? "#matter-breakdown" : undefined;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* HEADER */}
      <header>
        <h1 style={{ marginBottom: 4 }}>{props.title}</h1>
        {props.subtitle && <div style={{ opacity: 0.7 }}>{props.subtitle}</div>}
        <span style={{ display: "inline-block", marginTop: 4, padding: "2px 8px", borderRadius: 4, background: "#eee", fontSize: 12 }}>
          {props.status}
        </span>
      </header>

      {/* SUMMARY — every value clickable, links to the detail section that explains it */}
      <section aria-label="Financial Summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <SummaryCard label="Total Cost" value={summary.totalCost} href={costInvoiceHref ?? "#cost-detail"} />
        <SummaryCard label="Total Invoice" value={summary.totalInvoice} href={costInvoiceHref ?? "#invoices"} />
        <SummaryCard label="Total Payment" value={summary.totalPayment} href="#payments" />
        <SummaryCard label="Outstanding" value={summary.outstanding} href={costInvoiceHref ?? "#invoices"} />
        <SummaryCard label="Unallocated Amount" value={summary.unallocatedAmount} href="#payments" />
        <SummaryCard label="Deposit Received" value={summary.depositReceived} href="#deposits" />
        <SummaryCard label="Deposit Used" value={summary.depositUsed} href="#disbursements" />
        <SummaryCard label="Deposit Remaining" value={summary.depositRemaining} href="#deposits" />
      </section>

      {/* Client scope only: per-matter breakdown, Scenario 4/5 */}
      {props.matterBreakdown && (
        <section id="matter-breakdown" aria-label="Per-Matter Breakdown">
          <h2>Per Matter</h2>
          <p style={{ fontSize: 12, opacity: 0.6 }}>
            Drill-down untuk Total Cost, Total Invoice, dan Outstanding tingkat client — klik matter untuk rincian penuh.
          </p>
          <table width="100%" cellPadding={6}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Matter</th><th>Status</th><th>Outstanding</th><th>Deposit Remaining</th>
              </tr>
            </thead>
            <tbody>
              {props.matterBreakdown.map((m) => (
                <tr key={m.matterId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td><a href={props.linkHref("matter", m.matterId)}>{m.matterName}</a></td>
                  <td>{m.status}</td>
                  <td>{formatCurrency(m.summary.outstanding)}</td>
                  <td>{formatCurrency(m.summary.depositRemaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* DETAIL: Cost Detail — MATTER scope only, see costDetails prop note */}
      {props.costDetails && (
        <section id="cost-detail" aria-label="Cost Detail">
          <h2>Cost Detail</h2>
          {props.costDetails.length === 0 ? (
            <p style={{ opacity: 0.6 }}>Belum ada rincian biaya.</p>
          ) : (
            <table width="100%" cellPadding={6}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Source</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {props.costDetails.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td>{formatDate(c.costDate)}</td>
                    <td>{c.description}</td>
                    <td>{c.category ?? "-"}</td>
                    <td>{formatCurrency(c.amount)}</td>
                    <td>{c.sourceType}</td>
                    <td>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* DETAIL: Invoices — the Outstanding drill-down (master prompt's own example). MATTER scope only. */}
      {props.invoices && (
        <section id="invoices" aria-label="Invoices">
          <h2>Invoice</h2>
          {props.invoices.length === 0 ? (
            <p style={{ opacity: 0.6 }}>Belum ada invoice.</p>
          ) : (
            <table width="100%" cellPadding={6}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th>Invoice</th><th>Total</th><th>Allocated</th><th>Outstanding</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {props.invoices.map((inv) => (
                  <tr key={inv.invoiceId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td>{inv.invoiceNumber}</td>
                    <td>{formatCurrency(inv.totalAmount)}</td>
                    <td>{formatCurrency(inv.allocated)}</td>
                    <td>{formatCurrency(inv.outstanding)}</td>
                    <td>{inv.paymentStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* DETAIL: Payments + Allocations — the Unallocated Amount drill-down */}
      <section id="payments" aria-label="Payments">
        <h2>Payment{props.scope === "CLIENT" ? " (belum ter-assign ke matter)" : ""}</h2>
        {props.scope === "CLIENT" && (
          <p style={{ fontSize: 12, opacity: 0.6 }}>
            Payment yang sudah ter-assign ke matter tertentu ada di halaman matter masing-masing (lihat Per Matter di atas).
          </p>
        )}
        {props.payments.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Belum ada payment.</p>
        ) : (
          <table width="100%" cellPadding={6}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Date</th><th>Amount</th><th>Allocated</th><th>Unallocated</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {props.payments.map((p) => (
                <tr key={p.transactionId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{formatDate(p.date)}</td>
                  <td>{formatCurrency(p.amount)}</td>
                  <td>{formatCurrency(p.allocated)}</td>
                  <td>{formatCurrency(p.unallocated)}</td>
                  <td>{p.reviewStatus !== "NORMAL" && <span style={{ background: "#fde68a", padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>{p.reviewStatus}</span>}</td>
                  <td><a href={props.linkHref("transaction", p.transactionId)}>Trace →</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* DETAIL: Deposit / Funds */}
      <section id="deposits" aria-label="Deposit">
        <h2>Deposit / Funds</h2>
        <p>Received {formatCurrency(summary.depositReceived)} · Used {formatCurrency(summary.depositUsed)} · Remaining {formatCurrency(summary.depositRemaining)}</p>
        {props.scope === "CLIENT" && (
          <p style={{ fontSize: 12, opacity: 0.6 }}>
            Total di atas sudah mencakup semua matter (lihat Per Matter). Tabel di bawah hanya deposit yang belum ter-assign ke matter tertentu.
          </p>
        )}
        {props.deposits.length > 0 && (
          <table width="100%" cellPadding={6}>
            <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}><th>Date</th><th>Amount</th></tr></thead>
            <tbody>
              {props.deposits.map((d) => (
                <tr key={d.transactionId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{formatDate(d.date)}</td><td>{formatCurrency(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* DETAIL: Disbursements */}
      <section id="disbursements" aria-label="Disbursement">
        <h2>Disbursement</h2>
        {props.disbursements.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Belum ada disbursement.</p>
        ) : (
          <table width="100%" cellPadding={6}>
            <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}><th>Date</th><th>Category</th><th>Amount</th></tr></thead>
            <tbody>
              {props.disbursements.map((d) => (
                <tr key={d.transactionId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{formatDate(d.date)}</td><td>{d.category ?? "-"}</td><td>{formatCurrency(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* SOURCE / DOCUMENTS */}
      <section id="sources" aria-label="Documents / Sources">
        <h2>Document / Source</h2>
        {props.attachments.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Belum ada dokumen terlampir.</p>
        ) : (
          <ul>
            {props.attachments.map((a) => (
              <li key={a.id}>{a.fileName} <span style={{ opacity: 0.6 }}>({a.fileType ?? "file"}, diunggah {formatDate(a.uploadedAt)})</span></li>
            ))}
          </ul>
        )}
        <p style={{ fontSize: 12, opacity: 0.6 }}>
          Catatan: daftar ini hanya dokumen yang terlampir langsung ke {props.scope === "MATTER" ? "matter" : "client"} ini.
          Dokumen yang terlampir ke cost detail/invoice/transaksi tertentu di dalamnya belum tergabung di sini (lihat Step 14 gap note).
        </p>
      </section>

      {/* TIMELINE */}
      <section id="timeline" aria-label="Timeline">
        <h2>Timeline</h2>
        {props.history.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Belum ada riwayat aktivitas.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {props.history.map((h) => (
              <li key={h.id} style={{ borderLeft: "2px solid #ddd", paddingLeft: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{formatDateTime(h.occurredAt)} · {h.userId}</div>
                <div>{h.action} — {h.entityType}</div>
                {h.reason && <div style={{ fontSize: 12, opacity: 0.7 }}>Alasan: {h.reason}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
