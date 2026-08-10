"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ReviewStatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkDrawer } from "@/components/LinkDrawer";
import { SOURCE_TYPES } from "@/lib/enums";

export interface ReviewRow {
  id: string;
  transactionDate: Date | string;
  amount: { toString(): string };
  description: string;
  sourceType: string;
  sourceReference: string | null;
  notes: string | null;
  reviewStatus: "WARNING" | "REVIEW_REQUIRED";
  clientName: string | null;
  matterName: string | null;
  reason: string | null;
}

type Filter = "REVIEW_REQUIRED" | "WARNING" | "ALL";

// Section 19 Review Center: tabs are about review status only. UNLINKED-
// but-NORMAL transactions never appear here — that filter lives under
// /transactions?linked=unlinked (Principle 5).
export function UnlinkedReviewTable({ rows }: { rows: ReviewRow[] }) {
  const [filter, setFilter] = useState<Filter>("REVIEW_REQUIRED");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = rows.filter((r) => (filter === "ALL" ? true : r.reviewStatus === filter));
  const counts = {
    REVIEW_REQUIRED: rows.filter((r) => r.reviewStatus === "REVIEW_REQUIRED").length,
    WARNING: rows.filter((r) => r.reviewStatus === "WARNING").length,
    ALL: rows.length,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-control border border-border bg-white p-1 w-fit">
        {(["REVIEW_REQUIRED", "WARNING", "ALL"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-control px-3 py-1.5 text-xs font-medium transition-colors ${filter === f ? "bg-primary text-white" : "text-muted hover:bg-bg"}`}
          >
            {f === "REVIEW_REQUIRED" ? "Review Required" : f === "WARNING" ? "Warning" : "All"} ({counts[f]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Tidak ada item yang membutuhkan review" />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted">
                <th className="px-5 py-3">Date</th><th className="px-5 py-3">Transaction</th><th className="px-5 py-3">Client / Matter</th>
                <th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <RowWithPanel key={r.id} row={r} expanded={expandedId === r.id} onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RowWithPanel({ row, expanded, onToggle }: { row: ReviewRow; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-bg">
        <td className="px-5 py-3 whitespace-nowrap">{formatDate(row.transactionDate)}</td>
        <td className="px-5 py-3">{row.description}</td>
        <td className="px-5 py-3 text-muted">{row.clientName ?? "Unlinked"}{row.matterName ? ` / ${row.matterName}` : ""}</td>
        <td className="px-5 py-3 text-right">{formatCurrency(row.amount)}</td>
        <td className="px-5 py-3 text-muted">{row.reason ?? "-"}</td>
        <td className="px-5 py-3"><ReviewStatusBadge status={row.reviewStatus} /></td>
        <td className="px-5 py-3 whitespace-nowrap">
          <a href={`/transactions/${row.id}`} className="mr-3 text-primary hover:underline">Open</a>
          <button onClick={onToggle} className="text-muted hover:text-text">{expanded ? "Tutup" : "Kelola"}</button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-bg px-5 py-4">
            <ActionPanel row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

function ActionPanel({ row }: { row: ReviewRow }) {
  const [notes, setNotes] = useState(row.notes ?? "");
  const [sourceType, setSourceType] = useState(row.sourceType);
  const [sourceReference, setSourceReference] = useState(row.sourceReference ?? "");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function saveNoteAndSource() {
    setBusy(true);
    try {
      await apiFetch(`/api/transactions/${row.id}`, { method: "PATCH", body: JSON.stringify({ notes, sourceType, sourceReference: sourceReference || null }) });
      toast("success", "Transaksi berhasil diperbarui.");
    } catch (e) {
      toast("error", (e as Error).message || "Transaksi gagal disimpan. Tidak ada perubahan yang disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <LinkDrawer transactionId={row.id} currentClientName={row.clientName} />
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold text-text">Note & Source</h4>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="input" style={{ width: 160 }}>
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input placeholder="Source reference" value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} className="input" style={{ width: 240 }} />
        </div>
        <textarea placeholder="Catatan..." value={notes} onChange={(e) => setNotes(e.target.value)} className="input mb-2 min-h-16" />
        <Button size="sm" onClick={saveNoteAndSource} loading={busy}>Simpan Note & Source</Button>
      </div>
    </div>
  );
}
