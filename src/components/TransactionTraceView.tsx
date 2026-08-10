import { formatCurrency, formatDate, formatDateTime } from "@/lib/formatCurrency";
import { describeTimelineEvent } from "@/lib/timelineLabel";
import type { buildTransactionTrace } from "@/lib/trace";

// Step 17 — Transaction Trace UI. Server component, mirrors the node-graph
// design from Step 8: a node section is rendered only if it exists on this
// transaction — nothing fabricated, nothing shown as "N/A" filler.
type Trace = Awaited<ReturnType<typeof buildTransactionTrace>>;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.6 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

export function TransactionTraceView({ trace, matterHref }: { trace: Trace; matterHref: (id: string) => string }) {
  const { transaction, nodes, currentStatus, timeline } = trace;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* TRANSACTION DETAIL */}
      <section>
        <h1>Transaction Detail</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <Field label="Amount" value={formatCurrency(transaction.amount)} />
          <Field label="Date" value={formatDate(transaction.date)} />
          <Field label="Direction" value={transaction.direction} />
          <Field label="Type" value={currentStatus.financialType} />
          <Field label="Source" value={`${nodes.source.sourceType}${nodes.source.sourceReference ? ` — ${nodes.source.sourceReference}` : ""}`} />
          <Field
            label="Status"
            value={
              <>
                <span style={{ marginRight: 6 }}>{currentStatus.linkStatus}</span>
                {currentStatus.reviewStatus !== "NORMAL" && (
                  <span style={{ background: currentStatus.reviewStatus === "REVIEW_REQUIRED" ? "#fca5a5" : "#fde68a", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>
                    {currentStatus.reviewStatus}
                  </span>
                )}
                {currentStatus.transactionStatus === "VOIDED" && <span style={{ marginLeft: 6, opacity: 0.6 }}>(VOIDED)</span>}
              </>
            }
          />
        </div>
        <p style={{ marginTop: 8 }}>{transaction.description}</p>
      </section>

      {/* RELATIONSHIPS — each node only rendered if it actually exists */}
      <section>
        <h2>Relationships</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {nodes.client ? (
            <div>Client: <strong>{nodes.client.name}</strong></div>
          ) : (
            <div style={{ opacity: 0.6 }}>Client: belum ter-link (UNLINKED)</div>
          )}
          {nodes.matter ? (
            <div>Matter: <a href={matterHref(nodes.matter.id)}>{nodes.matter.matterName}</a></div>
          ) : (
            <div style={{ opacity: 0.6 }}>Matter: belum ter-link</div>
          )}
          {nodes.classification && (
            <div>Classification: <strong>{nodes.classification.type}</strong> — {formatCurrency(nodes.classification.amount)}</div>
          )}
          {nodes.allocations.length > 0 && (
            <div>
              Payment Allocations:
              <ul>
                {nodes.allocations.map((a) => (
                  <li key={a.allocationId}>
                    {formatCurrency(a.amount)} → {a.allocationType === "INVOICE_PAYMENT" ? `Invoice ${a.invoiceNumber}` : a.allocationType}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {nodes.costDetails.length > 0 && (
            <div>
              Cost Detail (ditagih di invoice terkait):
              <ul>
                {nodes.costDetails.map((c) => (
                  <li key={c.id}>{c.description} — {formatCurrency(c.amount)}</li>
                ))}
              </ul>
            </div>
          )}
          {nodes.disbursement && (
            <div>Disbursement: {nodes.disbursement.category ?? "-"}</div>
          )}
          {!nodes.client && !nodes.classification && (
            <p style={{ fontSize: 12, opacity: 0.6 }}>
              Transaksi ini belum punya relationship apapun selain source — ini valid, bukan data tidak lengkap (lihat Step 6/8).
            </p>
          )}
        </div>
      </section>

      {/* TIMELINE — narrative view of the same audit_log rows as the Audit table below */}
      <section>
        <h2>Timeline</h2>
        {timeline.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Belum ada riwayat.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {timeline.map((t) => (
              <li key={t.id} style={{ borderLeft: "2px solid #ddd", paddingLeft: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{formatDateTime(t.occurredAt)}</div>
                <div>{describeTimelineEvent(t)}</div>
                {t.reason && <div style={{ fontSize: 12, opacity: 0.7 }}>Alasan: {t.reason}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* AUDIT — structured table: User, Timestamp, Action */}
      <section>
        <h2>Audit</h2>
        {timeline.length === 0 ? (
          <p style={{ opacity: 0.6 }}>-</p>
        ) : (
          <table width="100%" cellPadding={6}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>User</th><th>Timestamp</th><th>Entity</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{t.userId}</td>
                  <td>{formatDateTime(t.occurredAt)}</td>
                  <td style={{ fontSize: 12 }}>{t.entityType}</td>
                  <td>{t.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
