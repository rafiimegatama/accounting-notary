"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { apiFetch } from "@/lib/apiClient";
import { SOURCE_TYPES } from "@/lib/enums";

export interface ReviewRow {
  id: string;
  transactionDate: Date | string;
  amount: { toString(): string };
  description: string;
  sourceType: string;
  sourceReference: string | null;
  notes: string | null;
  reviewStatus: string;
  isUnlinked: boolean;
  clientName: string | null;
  matterName: string | null;
}

type Filter = "ALL" | "UNLINKED" | "REVIEW_REQUIRED";

export function UnlinkedReviewTable({ rows: initialRows }: { rows: ReviewRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = rows.filter((r) => {
    if (filter === "UNLINKED") return r.isUnlinked;
    if (filter === "REVIEW_REQUIRED") return r.reviewStatus !== "NORMAL";
    return true;
  });

  function patchRow(id: string, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["ALL", "UNLINKED", "REVIEW_REQUIRED"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{ fontWeight: filter === f ? 700 : 400, padding: "4px 10px" }}
          >
            {f === "ALL" ? "Semua" : f === "UNLINKED" ? "Unlinked" : "Perlu Ditinjau"} ({
              f === "ALL" ? rows.length : f === "UNLINKED" ? rows.filter((r) => r.isUnlinked).length : rows.filter((r) => r.reviewStatus !== "NORMAL").length
            })
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p style={{ opacity: 0.6 }}>Tidak ada transaksi di kategori ini.</p>
      ) : (
        <table width="100%" cellPadding={6}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Date</th><th>Amount</th><th>Description</th><th>Source</th><th>Status</th><th>Notes</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <RowWithPanel
                key={r.id}
                row={r}
                expanded={expandedId === r.id}
                onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                onUpdate={(patch) => patchRow(r.id, patch)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatusBadges({ row }: { row: ReviewRow }) {
  return (
    <>
      {row.isUnlinked && <span style={{ background: "#e5e7eb", padding: "1px 6px", borderRadius: 4, fontSize: 11, marginRight: 4 }}>UNLINKED</span>}
      {row.reviewStatus !== "NORMAL" && (
        <span style={{ background: row.reviewStatus === "REVIEW_REQUIRED" ? "#fca5a5" : "#fde68a", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>
          {row.reviewStatus}
        </span>
      )}
      {!row.isUnlinked && row.clientName && <span style={{ fontSize: 11, opacity: 0.7 }}>{row.clientName}{row.matterName ? ` / ${row.matterName}` : ""}</span>}
    </>
  );
}

function RowWithPanel({
  row,
  expanded,
  onToggle,
  onUpdate,
}: {
  row: ReviewRow;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<ReviewRow>) => void;
}) {
  return (
    <>
      <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
        <td>{formatDate(row.transactionDate)}</td>
        <td>{formatCurrency(row.amount)}</td>
        <td>{row.description}</td>
        <td>{row.sourceType}{row.sourceReference ? ` (${row.sourceReference})` : ""}</td>
        <td><StatusBadges row={row} /></td>
        <td style={{ fontSize: 12, opacity: 0.8 }}>{row.notes ?? "-"}</td>
        <td>
          <a href={`/transactions/${row.id}`} style={{ marginRight: 8 }}>Lihat</a>
          <button onClick={onToggle}>{expanded ? "Tutup" : "Kelola"}</button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ background: "#fafafa", padding: 16 }}>
            <ActionPanel row={row} onUpdate={onUpdate} />
          </td>
        </tr>
      )}
    </>
  );
}

function ActionPanel({ row, onUpdate }: { row: ReviewRow; onUpdate: (patch: Partial<ReviewRow>) => void }) {
  const [notes, setNotes] = useState(row.notes ?? "");
  const [sourceType, setSourceType] = useState(row.sourceType);
  const [sourceReference, setSourceReference] = useState(row.sourceReference ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveNoteAndSource() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/transactions/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes, sourceType, sourceReference: sourceReference || null }),
      });
      onUpdate({ notes, sourceType, sourceReference: sourceReference || null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Link Client / Link Matter — the only way to leave UNLINKED, never forced */}
      <LinkPanel transactionId={row.id} onLinked={() => onUpdate({ isUnlinked: false })} />

      <div>
        <h4 style={{ marginBottom: 4 }}>Note & Source</h4>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
            {SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            placeholder="Source reference (mis. nama file, no. referensi)"
            value={sourceReference}
            onChange={(e) => setSourceReference(e.target.value)}
            style={{ minWidth: 220 }}
          />
        </div>
        <textarea
          placeholder="Catatan..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ width: "100%", marginTop: 8, minHeight: 60 }}
        />
        <button onClick={saveNoteAndSource} disabled={busy} style={{ marginTop: 4 }}>
          {busy ? "Menyimpan..." : "Simpan Note & Source"}
        </button>
        {error && <p style={{ color: "crimson", fontSize: 12 }}>{error}</p>}
      </div>

      <p style={{ fontSize: 12, opacity: 0.6 }}>
        Kalau belum jelas pemiliknya, tidak perlu melakukan apa-apa — biarkan tetap Unlinked.
      </p>
    </div>
  );
}

interface ClientOption { id: string; name: string }
interface MatterOption { id: string; matterName: string }

function LinkPanel({ transactionId, onLinked }: { transactionId: string; onLinked: () => void }) {
  const [query, setQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) { setClientResults([]); return; }
    const results = await apiFetch<ClientOption[]>(`/api/clients?search=${encodeURIComponent(q)}`);
    setClientResults(results);
  }

  async function pickClient(c: ClientOption) {
    setSelectedClient(c);
    setClientResults([]);
    setQuery(c.name);
    const m = await apiFetch<MatterOption[]>(`/api/matters?clientId=${c.id}`);
    setMatters(m);
  }

  async function linkToClientOnly() {
    if (!selectedClient) return;
    setBusy(true); setError(null);
    try {
      await apiFetch(`/api/transactions/${transactionId}/link`, {
        method: "POST",
        body: JSON.stringify({ action: "LINK_CLIENT", clientId: selectedClient.id }),
      });
      setDone(`Ter-link ke client ${selectedClient.name}.`);
      onLinked();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function linkToMatter(matterId: string, matterName: string) {
    setBusy(true); setError(null);
    try {
      await apiFetch(`/api/transactions/${transactionId}/link`, {
        method: "POST",
        body: JSON.stringify({ action: "LINK_MATTER", matterId }),
      });
      setDone(`Ter-link ke matter ${matterName}.`);
      onLinked();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (done) return <div><h4>Link Client / Matter</h4><p style={{ color: "green" }}>{done}</p></div>;

  return (
    <div>
      <h4 style={{ marginBottom: 4 }}>Link Client / Matter</h4>
      <input placeholder="Cari nama client..." value={query} onChange={(e) => search(e.target.value)} style={{ minWidth: 240 }} />
      {clientResults.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, border: "1px solid #ddd", maxWidth: 300 }}>
          {clientResults.map((c) => (
            <li key={c.id} onClick={() => pickClient(c)} style={{ padding: 6, cursor: "pointer" }}>{c.name}</li>
          ))}
        </ul>
      )}
      {selectedClient && (
        <div style={{ marginTop: 8 }}>
          <button onClick={linkToClientOnly} disabled={busy}>Link ke Client "{selectedClient.name}" saja</button>
          {matters.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>atau pilih matter langsung:</div>
              {matters.map((m) => (
                <button key={m.id} onClick={() => linkToMatter(m.id, m.matterName)} disabled={busy} style={{ marginRight: 6, marginTop: 4 }}>
                  {m.matterName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <p style={{ color: "crimson", fontSize: 12 }}>{error}</p>}
    </div>
  );
}
