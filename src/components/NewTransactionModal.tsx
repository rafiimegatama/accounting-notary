"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Typeahead } from "@/components/ui/Typeahead";
import { FieldHelp } from "@/components/ui/FieldHelp";
import { useModalFocusTrap } from "@/components/ui/useModalFocusTrap";
import { SOURCE_TYPES, FINANCIAL_TYPES } from "@/lib/enums";
import { FIELD_HELP } from "@/lib/fieldHelp";
import { transactionCreateNextHint } from "@/lib/toastNextHints";
import { getRecentClients, getRecentMattersForClient, recordRecentClient, recordRecentMatter } from "@/lib/recentSelections";

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

  const [sourceRefSuggestions, setSourceRefSuggestions] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced client search (P0 performance rule: don't query on every
  // keystroke). Skipped entirely once a client is selected — typing again
  // after that means the user is changing their mind, handled below.
  useEffect(() => {
    if (selectedClient || clientQuery.trim().length < 2) { setClientResults([]); return; }
    const t = setTimeout(async () => {
      setClientResults(await apiFetch<ClientOption[]>(`/api/clients?search=${encodeURIComponent(clientQuery)}`));
    }, 250);
    return () => clearTimeout(t);
  }, [clientQuery, selectedClient]);

  // Same debounce rule as client search above — no query on every keystroke.
  // Free text always stays valid on submit; this only offers past values.
  useEffect(() => {
    if (sourceReference.trim().length < 2) { setSourceRefSuggestions([]); return; }
    const t = setTimeout(async () => {
      setSourceRefSuggestions(await apiFetch<string[]>(`/api/transactions/source-references?search=${encodeURIComponent(sourceReference)}`));
    }, 250);
    return () => clearTimeout(t);
  }, [sourceReference]);

  const panelRef = useModalFocusTrap<HTMLFormElement>(open, onClose);

  if (!open) return null;

  function handleClientQueryChange(q: string) {
    setClientQuery(q);
    // P1.1: changing the client query invalidates whatever matter was
    // selected for the previous client — never silently keep a stale
    // client/matter pairing (docs/PROJECT_RULES.md constraint 2/3 territory
    // even though this is a UI-only change: no auto-claim, no guessing).
    setSelectedClient(null);
    setSelectedMatter(null);
    setMatters([]);
  }

  async function pickClient(c: ClientOption) {
    setSelectedClient(c);
    setClientResults([]);
    setClientQuery(c.name);
    setSelectedMatter(null);
    const m = await apiFetch<MatterOption[]>(`/api/matters?clientId=${c.id}`);
    setMatters(m);
    recordRecentClient({ id: c.id, name: c.name });
  }

  function reset() {
    setDate(new Date().toISOString().slice(0, 10));
    setAmount(""); setDescription(""); setFinancialType(""); setSourceType("MANUAL"); setSourceReference(""); setNotes("");
    setClientQuery(""); setClientResults([]); setSelectedClient(null); setMatters([]); setSelectedMatter(null);
    setSourceRefSuggestions([]);
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
      const hint = transactionCreateNextHint(Boolean(selectedClient || selectedMatter));
      toast("success", "Transaksi berhasil disimpan.", hint && { next: hint.text });
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

  // Recent Matter (this client's own history only — matter is always
  // scoped under a chosen client, see recentSelections.ts). Cross-referenced
  // against the just-fetched `matters` list so a recent matter that no
  // longer exists (or belongs to a client whose matters changed) silently
  // drops out instead of rendering a dead entry — "fail gracefully."
  const recentMatters = selectedClient
    ? getRecentMattersForClient(selectedClient.id)
        .map((rm) => matters.find((m) => m.id === rm.id))
        .filter((m): m is MatterOption => Boolean(m))
    : [];
  const recentMatterIds = new Set(recentMatters.map((m) => m.id));
  const otherMatters = matters.filter((m) => !recentMatterIds.has(m.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        ref={panelRef}
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

        <Field label="Client (opsional)" className="mb-3">
          <Typeahead
            id="txn-client"
            value={clientQuery}
            onChange={handleClientQueryChange}
            options={clientResults.map((c) => ({ value: c.id, label: c.name }))}
            // Built directly from the option, not looked up in
            // `clientResults` — a Recent option isn't a search result, so
            // it would never be found there. This is the exact same
            // pickClient() call either way, just fed the id/name that were
            // already on the option (label is always the client's `name`).
            onSelect={(opt) => pickClient({ id: opt.value, name: opt.label })}
            placeholder="Cari client... (boleh dikosongkan)"
            emptyHint={clientQuery.trim().length >= 2 && !selectedClient ? "Tidak ada match — boleh dikosongkan, tidak wajib diisi." : undefined}
            recentOptions={getRecentClients().map((c) => ({ value: c.id, label: c.name }))}
          />
        </Field>

        {selectedClient && matters.length > 0 && (
          <Field label="Matter (opsional)" className="mb-3">
            <select
              value={selectedMatter?.id ?? ""}
              onChange={(e) => {
                const m = matters.find((x) => x.id === e.target.value) ?? null;
                setSelectedMatter(m);
                if (m) recordRecentMatter({ id: m.id, matterName: m.matterName, clientId: selectedClient.id, clientName: selectedClient.name });
              }}
              className="input"
            >
              <option value="">— tidak dipilih —</option>
              {recentMatters.length > 0 && (
                <optgroup label="Recent">
                  {recentMatters.map((m) => (
                    <option key={m.id} value={m.id}>{m.matterName}</option>
                  ))}
                </optgroup>
              )}
              {otherMatters.map((m) => (
                <option key={m.id} value={m.id}>{m.matterName}</option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Financial Type (opsional)" help={FIELD_HELP.financialType} helpAriaLabel="Penjelasan Financial Type">
            <select value={financialType} onChange={(e) => setFinancialType(e.target.value)} className="input">
              <option value="">— belum diklasifikasi —</option>
              {FINANCIAL_TYPES.filter((f) => f !== "UNCLASSIFIED").map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label="Source Type" help={FIELD_HELP.sourceType} helpAriaLabel="Penjelasan Source Type">
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="input">
              {SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Source Reference (opsional)" className="mb-3">
          <div className="relative">
            <Typeahead
              id="txn-source-reference"
              value={sourceReference}
              onChange={setSourceReference}
              options={sourceRefSuggestions.map((s) => ({ value: s, label: s }))}
              onSelect={(opt) => setSourceReference(opt.value)}
              placeholder="Nama file, no. referensi, dsb."
              inputClassName="input pr-7"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2">
              <FieldHelp content={FIELD_HELP.sourceReference} ariaLabel="Penjelasan Source Reference" />
            </span>
          </div>
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

function Field({
  label,
  children,
  className = "",
  help,
  helpAriaLabel,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  help?: string;
  helpAriaLabel?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 flex items-center gap-1 text-xs font-medium text-text">
        <span>{label}</span>
        {help && <FieldHelp content={help} ariaLabel={helpAriaLabel ?? `Penjelasan ${label}`} />}
      </label>
      {children}
    </div>
  );
}
