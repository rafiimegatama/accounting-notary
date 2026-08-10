"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { SOURCE_TYPES, FINANCIAL_TYPES } from "@/lib/enums";

interface ClientOption { id: string; name: string }
interface MatterOption { id: string; matterName: string }

// Section 12 "Create Transaction": client/matter MUST remain optional —
// this form can submit with both left empty, and does (Principle 1: no
// forced Client/Matter selection, ever).
export function NewTransactionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [description, setDescription] = useState("");
  const [financialType, setFinancialType] = useState("");
  const [sourceType, setSourceType] = useState("MANUAL");
  const [sourceReference, setSourceReference] = useState("");
  const [notes, setNotes] = useState("");

  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [selectedMatter, setSelectedMatter] = useState<MatterOption | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function searchClients(q: string) {
    setClientQuery(q);
    setSelectedClient(null);
    setSelectedMatter(null);
    setMatters([]);
    if (q.trim().length < 2) { setClientResults([]); return; }
    const results = await apiFetch<ClientOption[]>(`/api/clients?search=${encodeURIComponent(q)}`);
    setClientResults(results);
  }

  async function pickClient(c: ClientOption) {
    setSelectedClient(c);
    setClientResults([]);
    setClientQuery(c.name);
    const m = await apiFetch<MatterOption[]>(`/api/matters?clientId=${c.id}`);
    setMatters(m);
  }

  function reset() {
    setDate(new Date().toISOString().slice(0, 10));
    setAmount(""); setDescription(""); setFinancialType(""); setSourceType("MANUAL"); setSourceReference(""); setNotes("");
    setClientQuery(""); setClientResults([]); setSelectedClient(null); setMatters([]); setSelectedMatter(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<{ id: string }>("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          transactionDate: date,
          amount: Number(amount),
          direction,
          description,
          financialType: financialType || undefined,
          clientId: selectedMatter ? undefined : selectedClient?.id,
          matterId: selectedMatter?.id,
          sourceType,
          sourceReference: sourceReference || undefined,
          notes: notes || undefined,
        }),
      });
      toast("success", "Transaksi berhasil disimpan.");
      reset();
      onClose();
      router.push(`/transactions/${created.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "Transaksi gagal disimpan. Tidak ada perubahan yang disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-card bg-card p-6 shadow-lg border border-border"
      >
        <h2 className="text-lg font-semibold text-text mb-1">New Transaction</h2>
        <p className="text-sm text-muted mb-5">Client/Matter opsional — boleh dikosongkan kalau memang belum diketahui.</p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Tanggal">
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </Field>
          <Field label="Direction">
            <select value={direction} onChange={(e) => setDirection(e.target.value as "IN" | "OUT")} className="input">
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
            </select>
          </Field>
        </div>

        <Field label="Amount" className="mb-3">
          <input type="number" required min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" placeholder="0" />
        </Field>

        <Field label="Description" className="mb-3">
          <input required value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="Deskripsi transaksi" />
        </Field>

        <Field label="Client (opsional)" className="mb-1 relative">
          <input value={clientQuery} onChange={(e) => searchClients(e.target.value)} className="input" placeholder="Cari client..." />
          {clientResults.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-control border border-border bg-white shadow-md max-h-40 overflow-y-auto">
              {clientResults.map((c) => (
                <li key={c.id} onClick={() => pickClient(c)} className="cursor-pointer px-3 py-2 text-sm hover:bg-bg">{c.name}</li>
              ))}
            </ul>
          )}
        </Field>

        {selectedClient && matters.length > 0 && (
          <Field label="Matter (opsional)" className="mb-3">
            <select
              value={selectedMatter?.id ?? ""}
              onChange={(e) => setSelectedMatter(matters.find((m) => m.id === e.target.value) ?? null)}
              className="input"
            >
              <option value="">— tidak dipilih —</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>{m.matterName}</option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Financial Type (opsional)">
            <select value={financialType} onChange={(e) => setFinancialType(e.target.value)} className="input">
              <option value="">— belum diklasifikasi —</option>
              {FINANCIAL_TYPES.filter((f) => f !== "UNCLASSIFIED").map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label="Source Type">
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="input">
              {SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Source Reference (opsional)" className="mb-3">
          <input value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} className="input" placeholder="Nama file, no. referensi, dsb." />
        </Field>

        <Field label="Notes (opsional)" className="mb-4">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-16" />
        </Field>

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Batal</Button>
          <Button type="submit" loading={busy}>Simpan Transaksi</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-text">{label}</label>
      {children}
    </div>
  );
}
