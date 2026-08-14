import { formatCurrency, formatDate, formatDateTime } from "@/lib/formatCurrency";
import { describeTimelineEvent } from "@/lib/timelineLabel";
import type { buildTransactionTrace } from "@/lib/trace";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkStatusBadge, ReviewStatusBadge } from "@/components/ui/StatusBadge";
import { LinkDrawer } from "@/components/LinkDrawer";
import { ClassifyTransactionPanel, VoidTransactionButton, AllocateInline } from "@/components/TransactionActions";
import { suggestedActionForReason } from "@/lib/exceptionExplain";

// Step 17 (rebuilt, Section 13/40). Server component, mirrors the node-graph
// design from Step 8: a node section is rendered only if it exists on this
// transaction — nothing fabricated, nothing shown as "N/A" filler.
type Trace = Awaited<ReturnType<typeof buildTransactionTrace>>;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-0.5 text-sm text-text">{value}</div>
    </div>
  );
}

// Roadmap #2 "Clearer payment correction workflow" — the old<->new link
// between a voided transaction and its replacement has no schema column
// (POST /api/payments/[id]/correct writes it only into the audit trail, on
// both sides — see that route's file header comment). These read the exact
// fields that endpoint writes; nothing here fetches new data, timeline
// entries already carry previousValue/newValue via buildTransactionTrace().
function correctedByTransactionId(entry: { entityType: string; action: string; newValue: unknown }): string | null {
  if (entry.entityType !== "FINANCIAL_TRANSACTION" || entry.action !== "VOID") return null;
  const newVal = (entry.newValue ?? {}) as Record<string, unknown>;
  return typeof newVal.correctedByTransactionId === "string" ? newVal.correctedByTransactionId : null;
}

function correctsTransactionId(entry: { entityType: string; action: string; previousValue: unknown }): string | null {
  if (entry.entityType !== "FINANCIAL_TRANSACTION" || entry.action !== "CREATE") return null;
  const prevVal = (entry.previousValue ?? {}) as Record<string, unknown>;
  return typeof prevVal.correctsTransactionId === "string" ? prevVal.correctsTransactionId : null;
}

export function TransactionTraceView({ trace, matterHref }: { trace: Trace; matterHref: (id: string) => string }) {
  const { transaction, nodes, currentStatus, timeline } = trace;
  const linkStatus = currentStatus.linkStatus as "UNLINKED" | "LINKED_TO_CLIENT" | "LINKED_TO_MATTER";

  const totalAllocated = nodes.allocations.reduce((a, x) => a + Number(x.amount), 0);
  const unallocated = Number(transaction.amount) - totalAllocated;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-text">Transaction Detail</h1>
          <div className="flex items-center gap-2">
            <LinkStatusBadge status={linkStatus} />
            <ReviewStatusBadge status={currentStatus.reviewStatus as "NORMAL" | "WARNING" | "REVIEW_REQUIRED"} />
            {currentStatus.transactionStatus === "VOIDED" && <span className="text-xs text-muted">(VOIDED)</span>}
          </div>
        </CardHeader>
        <CardBody>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Amount" value={formatCurrency(transaction.amount)} />
            <Field label="Date" value={formatDate(transaction.date)} />
            <Field label="Direction" value={transaction.direction} />
            <Field label="Type" value={currentStatus.financialType} />
            <Field
              label="Source"
              value={
                nodes.source.sourceType === "SOURCE_PENDING" ? (
                  <span className="text-warning">Source belum dilengkapi</span>
                ) : (
                  `${nodes.source.sourceType}${nodes.source.sourceReference ? ` — ${nodes.source.sourceReference}` : ""}`
                )
              }
            />
          </div>
          <p className="text-sm text-text">{transaction.description}</p>
          {transaction.notes && <p className="mt-1 text-xs text-muted">Notes: {transaction.notes}</p>}

          {currentStatus.transactionStatus === "ACTIVE" && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
              <LinkDrawer
                transactionId={transaction.id}
                currentClientName={nodes.client?.name ?? null}
                currentMatterName={nodes.matter?.matterName ?? null}
                currentClientId={nodes.client?.id ?? null}
                currentMatterId={nodes.matter?.id ?? null}
              />
              {currentStatus.financialType === "UNCLASSIFIED" && <ClassifyTransactionPanel transactionId={transaction.id} direction={transaction.direction as "IN" | "OUT"} />}
              {nodes.classification?.type === "PAYMENT" && nodes.classification.paymentId && unallocated > 0 && (
                <AllocateInline
                  paymentId={nodes.classification.paymentId}
                  unallocated={unallocated}
                  matterId={nodes.matter?.id ?? null}
                  showPaymentDetailLink
                />
              )}
              <VoidTransactionButton transactionId={transaction.id} />
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-text">Relationships</h2></CardHeader>
        <CardBody>
          <div className="flex flex-col gap-3 text-sm">
            {nodes.client ? (
              <div>Client: <a href={`/clients/${nodes.client.id}`} className="font-medium text-primary hover:underline">{nodes.client.name}</a></div>
            ) : (
              <div className="text-muted">Client: belum ter-link (UNLINKED)</div>
            )}
            {nodes.matter ? (
              <div>Matter: <a href={matterHref(nodes.matter.id)} className="font-medium text-primary hover:underline">{nodes.matter.matterName}</a></div>
            ) : (
              <div className="text-muted">Matter: belum ter-link</div>
            )}
            {nodes.classification && (
              <div>Classification: <span className="font-medium">{nodes.classification.type}</span> — {formatCurrency(nodes.classification.amount)}</div>
            )}
            {nodes.deposit && (
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Deposit</div>
                <div>{nodes.deposit.notes || <span className="text-muted">(tidak ada catatan)</span>}</div>
              </div>
            )}
            {nodes.allocations.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Payment Allocations</div>
                <div className="overflow-x-auto rounded-control border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-bg text-left text-xs font-medium text-muted">
                        <th className="px-3 py-2">Invoice</th>
                        <th className="px-3 py-2 text-right">Allocated Amount</th>
                        <th className="px-3 py-2 text-right">Invoice Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.allocations.map((a) => (
                        <tr key={a.allocationId} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            {a.allocationType === "INVOICE_PAYMENT" && a.invoiceId ? (
                              <a href={`/invoices/${a.invoiceId}`} className="text-primary hover:underline">{a.invoiceNumber}</a>
                            ) : (
                              a.allocationType
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{formatCurrency(a.amount)}</td>
                          <td className="px-3 py-2 text-right">{a.invoiceOutstanding !== null ? formatCurrency(a.invoiceOutstanding) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {nodes.costDetails.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Rincian Biaya (ditagih di invoice terkait)</div>
                <ul className="space-y-1">
                  {nodes.costDetails.map((c) => (
                    <li key={c.id}>{c.description} — {formatCurrency(c.amount)}</li>
                  ))}
                </ul>
              </div>
            )}
            {nodes.disbursement && (
              <div>
                <div>Disbursement category: {nodes.disbursement.category ?? "-"}</div>
                {/* Roadmap #3: bankAccountId is optional (linkage never
                    forced, CLAUDE.md §7 point 2) — omit the line entirely
                    when absent instead of rendering "Bank account: -",
                    same convention as the Deposit/Classification blocks
                    above which don't render at all when the node is null. */}
                {nodes.disbursement.bankAccount && (
                  <div className="text-xs text-muted">
                    Bank account: {[nodes.disbursement.bankAccount.bankName, nodes.disbursement.bankAccount.accountName].filter(Boolean).join(" — ")}
                  </div>
                )}
              </div>
            )}
            {!nodes.client && !nodes.classification && (
              <p className="text-xs text-muted">Transaksi ini belum punya relationship apapun selain source — ini valid, bukan data tidak lengkap.</p>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-text">Sources & Attachments</h2></CardHeader>
        <CardBody>
          {nodes.source.attachments.length === 0 ? (
            <p className="text-sm text-muted">
              {nodes.source.sourceType === "SOURCE_PENDING"
                ? "Source belum dilengkapi — belum ada attachment terlampir."
                : "Tidak ada attachment terlampir pada transaksi ini."}
            </p>
          ) : (
            <ul className="space-y-2">
              {nodes.source.attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <a href={`/api/attachments/${a.id}`} className="text-primary hover:underline">{a.fileName}</a>
                  <span className="text-xs text-muted">{formatDateTime(a.uploadedAt)} · {a.uploadedBy}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-text">Timeline</h2></CardHeader>
        <CardBody>
          {timeline.length === 0 ? (
            <EmptyState title="Belum ada riwayat" />
          ) : (
            <ul className="space-y-4">
              {timeline.map((t) => {
                const correctedBy = correctedByTransactionId(t);
                const corrects = correctsTransactionId(t);
                return (
                  <li key={t.id} className="border-l-2 border-border pl-3">
                    <div className="text-xs text-muted">{formatDateTime(t.occurredAt)}</div>
                    <div className="text-sm text-text">{describeTimelineEvent(t)}</div>
                    {t.reason && <div className="text-xs text-muted">Alasan: {t.reason}</div>}
                    {suggestedActionForReason(t.reason) && (
                      <div className="text-xs text-primary">Aksi: {suggestedActionForReason(t.reason)}</div>
                    )}
                    {correctedBy && (
                      <a href={`/transactions/${correctedBy}`} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                        Dikoreksi oleh →
                      </a>
                    )}
                    {corrects && (
                      <a href={`/transactions/${corrects}`} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                        Mengoreksi →
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-text">Audit</h2></CardHeader>
        <CardBody className="p-0">
          {timeline.length === 0 ? (
            <EmptyState title="Belum ada audit event" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-5 py-2.5">User</th><th className="px-5 py-2.5">Timestamp</th><th className="px-5 py-2.5">Entity</th><th className="px-5 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5">{t.userId}</td>
                    <td className="px-5 py-2.5">{formatDateTime(t.occurredAt)}</td>
                    <td className="px-5 py-2.5 text-xs text-muted">{t.entityType}</td>
                    <td className="px-5 py-2.5">{t.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
