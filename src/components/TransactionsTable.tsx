"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { LinkStatusBadge, ReviewStatusBadge } from "@/components/ui/StatusBadge";
import { BulkActionToolbar } from "@/components/BulkActionToolbar";
import { FieldHelp } from "@/components/ui/FieldHelp";
import { FIELD_HELP } from "@/lib/fieldHelp";

export interface TransactionRow {
  id: string;
  transactionDate: Date | string;
  direction: string;
  amount: { toString(): string };
  description: string;
  clientId: string | null;
  clientName: string | null;
  matterId: string | null;
  matterName: string | null;
  financialType: string;
  linkStatus: "UNLINKED" | "LINKED_TO_CLIENT" | "LINKED_TO_MATTER";
  reviewStatus: "NORMAL" | "WARNING" | "REVIEW_REQUIRED";
  sourceType: string;
}

// Phase 5 bulk select — a plain client component wrapping the existing
// table markup (same columns/classes as before), adding a checkbox column
// and BulkActionToolbar. Selection is local UI state only; nothing is
// mutated until the toolbar's explicit Apply + confirm.
export function TransactionsTable({ rows }: { rows: TransactionRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) => (s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  return (
    <div>
      <BulkActionToolbar selectedIds={Array.from(selected)} onDone={() => setSelected(new Set())} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted">
              <th className="w-8 px-5 py-3">
                <input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Transaction ID</th>
              <th className="px-5 py-3">Direction</th>
              <th className="px-5 py-3 text-right">Amount</th>
              <th className="px-5 py-3">Description</th>
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Matter</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">
                {/* Single natural anchor for this explanation across the app
                    (P1 item #11) — this column header, not every row's
                    badge, per the "selective help" principle. */}
                <span className="inline-flex items-center gap-1">
                  <span>Link Status</span>
                  <FieldHelp content={FIELD_HELP.linkStatus} ariaLabel="Penjelasan Link Status" />
                </span>
              </th>
              <th className="px-5 py-3">Review</th>
              <th className="px-5 py-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className={`border-b border-border last:border-0 hover:bg-bg ${selected.has(t.id) ? "bg-blue-50" : ""}`}>
                <td className="px-5 py-3">
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Select ${t.description}`} />
                </td>
                <td className="px-5 py-3 whitespace-nowrap">{formatDate(t.transactionDate)}</td>
                <td className="px-5 py-3 font-mono text-xs text-muted">{t.id.slice(0, 8)}</td>
                <td className="px-5 py-3">{t.direction}</td>
                <td className="px-5 py-3 text-right">{formatCurrency(t.amount)}</td>
                <td className="px-5 py-3"><a href={`/transactions/${t.id}`} className="font-medium text-text hover:text-primary">{t.description}</a></td>
                <td className="px-5 py-3 text-muted">
                  {t.clientId ? <a href={`/clients/${t.clientId}`} className="text-primary hover:underline">{t.clientName}</a> : "-"}
                </td>
                <td className="px-5 py-3 text-muted">
                  {t.matterId ? <a href={`/matters/${t.matterId}`} className="text-primary hover:underline">{t.matterName}</a> : "-"}
                </td>
                <td className="px-5 py-3 text-muted">{t.financialType}</td>
                <td className="px-5 py-3"><LinkStatusBadge status={t.linkStatus} /></td>
                <td className="px-5 py-3"><ReviewStatusBadge status={t.reviewStatus} /></td>
                <td className="px-5 py-3 text-muted">{t.sourceType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
