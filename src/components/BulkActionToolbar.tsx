"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { Button } from "@/components/ui/Button";
import { Typeahead } from "@/components/ui/Typeahead";
import { FINANCIAL_TYPES } from "@/lib/enums";

interface ClientOption { id: string; name: string }
interface MatterOption { id: string; matterName: string }

// Phase 5 "Bulk Workflow" — ergonomic improvement for repetitive manual
// entry, not a new business rule: every bulk action is just the existing
// single-transaction endpoint (/link, /classify) called once per selected
// id. No new bulk API route, no auto-assign/infer — the staff member picks
// the client/matter/classification explicitly, same as the single-item
// flow, just applied to N items after an explicit confirmation.
export function BulkActionToolbar({ selectedIds, onDone }: { selectedIds: string[]; onDone: () => void }) {
  const [mode, setMode] = useState<"NONE" | "LINK" | "CLASSIFY">("NONE");
  const router = useRouter();

  if (selectedIds.length === 0) return null;

  return (
    <div className="sticky top-0 z-10 mb-3 flex flex-col gap-3 rounded-control border border-primary/30 bg-blue-50 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-text">{selectedIds.length} selected</span>
        <Button size="sm" variant="secondary" onClick={() => setMode(mode === "LINK" ? "NONE" : "LINK")}>Assign Client / Matter</Button>
        <Button size="sm" variant="secondary" onClick={() => setMode(mode === "CLASSIFY" ? "NONE" : "CLASSIFY")}>Classify</Button>
        <button onClick={onDone} className="ml-auto text-xs text-muted hover:text-text">Batalkan pilihan</button>
      </div>
      {mode === "LINK" && <BulkLinkPanel selectedIds={selectedIds} onApplied={() => { setMode("NONE"); onDone(); router.refresh(); }} />}
      {mode === "CLASSIFY" && <BulkClassifyPanel selectedIds={selectedIds} onApplied={() => { setMode("NONE"); onDone(); router.refresh(); }} />}
    </div>
  );
}

// Applies `action` to every id in `ids` via the existing single-entity
// endpoint, never a new bulk endpoint. Uses allSettled so one failure
// (e.g. a transaction already classified) doesn't abort the rest — each
// call still goes through the real route, so audit logging is untouched.
async function applyToEach<T>(ids: string[], call: (id: string) => Promise<T>): Promise<{ ok: number; failed: number }> {
  const results = await Promise.allSettled(ids.map((id) => call(id)));
  const ok = results.filter((r) => r.status === "fulfilled").length;
  return { ok, failed: results.length - ok };
}

function BulkLinkPanel({ selectedIds, onApplied }: { selectedIds: string[]; onApplied: () => void }) {
  const [query, setQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [selectedMatter, setSelectedMatter] = useState<MatterOption | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (selectedClient || query.trim().length < 2) { setClientResults([]); return; }
    const t = setTimeout(async () => setClientResults(await apiFetch<ClientOption[]>(`/api/clients?search=${encodeURIComponent(query)}`)), 250);
    return () => clearTimeout(t);
  }, [query, selectedClient]);

  async function pickClient(c: ClientOption) {
    setSelectedClient(c);
    setClientResults([]);
    setQuery(c.name);
    setSelectedMatter(null);
    setMatters(await apiFetch<MatterOption[]>(`/api/matters?clientId=${c.id}`));
  }

  async function apply() {
    if (!selectedClient) return;
    setBusy(true);
    setResult(null);
    const body = selectedMatter
      ? { action: "LINK_MATTER", matterId: selectedMatter.id }
      : { action: "LINK_CLIENT", clientId: selectedClient.id };
    const { ok, failed } = await applyToEach(selectedIds, (id) =>
      apiFetch(`/api/transactions/${id}/link`, { method: "POST", body: JSON.stringify(body) })
    );
    setBusy(false);
    setConfirming(false);
    setResult(`${ok} berhasil di-link${failed > 0 ? `, ${failed} gagal` : ""}.`);
    if (ok > 0) setTimeout(onApplied, 800);
  }

  return (
    <div className="flex flex-col gap-2 border-t border-primary/20 pt-3">
      <div className="max-w-sm">
        <Typeahead
          id="bulk-link-client"
          value={query}
          onChange={(q) => { setQuery(q); setSelectedClient(null); setMatters([]); setSelectedMatter(null); }}
          options={clientResults.map((c) => ({ value: c.id, label: c.name }))}
          onSelect={(opt) => { const c = clientResults.find((r) => r.id === opt.value); if (c) pickClient(c); }}
          placeholder="Assign Client..."
        />
      </div>
      {selectedClient && matters.length > 0 && (
        <select
          value={selectedMatter?.id ?? ""}
          onChange={(e) => setSelectedMatter(matters.find((m) => m.id === e.target.value) ?? null)}
          className="input max-w-sm"
        >
          <option value="">— hanya Client, tanpa Matter —</option>
          {matters.map((m) => <option key={m.id} value={m.id}>{m.matterName}</option>)}
        </select>
      )}
      {selectedClient && !confirming && (
        <Button size="sm" className="w-fit" onClick={() => setConfirming(true)}>
          Apply ke {selectedIds.length} transaksi
        </Button>
      )}
      {confirming && (
        <div className="flex items-center gap-2 rounded-control border border-border bg-white p-2 text-sm">
          <span>
            Assign {selectedIds.length} transaksi terpilih ke {selectedMatter ? selectedMatter.matterName : selectedClient!.name}?
          </span>
          <Button size="sm" loading={busy} onClick={apply}>Yes</Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
        </div>
      )}
      {result && <p className="text-xs text-muted">{result}</p>}
    </div>
  );
}

function BulkClassifyPanel({ selectedIds, onApplied }: { selectedIds: string[]; onApplied: () => void }) {
  const [financialType, setFinancialType] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function apply() {
    setBusy(true);
    setResult(null);
    const { ok, failed } = await applyToEach(selectedIds, (id) =>
      apiFetch(`/api/transactions/${id}/classify`, { method: "POST", body: JSON.stringify({ financialType }) })
    );
    setBusy(false);
    setConfirming(false);
    setResult(`${ok} berhasil diklasifikasikan${failed > 0 ? `, ${failed} gagal (mis. arah transaksi tidak cocok atau sudah diklasifikasikan)` : ""}.`);
    if (ok > 0) setTimeout(onApplied, 800);
  }

  return (
    <div className="flex flex-col gap-2 border-t border-primary/20 pt-3">
      <select value={financialType} onChange={(e) => { setFinancialType(e.target.value); setConfirming(false); }} className="input max-w-sm">
        <option value="">Classify as...</option>
        {FINANCIAL_TYPES.filter((f) => f !== "UNCLASSIFIED").map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      {financialType && !confirming && (
        <Button size="sm" className="w-fit" onClick={() => setConfirming(true)}>
          Apply ke {selectedIds.length} transaksi
        </Button>
      )}
      {confirming && (
        <div className="flex items-center gap-2 rounded-control border border-border bg-white p-2 text-sm">
          <span>Klasifikasikan {selectedIds.length} transaksi terpilih sebagai {financialType}?</span>
          <Button size="sm" loading={busy} onClick={apply}>Yes</Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
        </div>
      )}
      {result && <p className="text-xs text-muted">{result}</p>}
    </div>
  );
}
