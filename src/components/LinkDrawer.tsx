"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

interface ClientOption { id: string; name: string }
interface MatterOption { id: string; matterName: string }

// Section 14 Link Workflow: UNLINKED → Client, UNLINKED → Matter, Client →
// Matter — all via this one drawer. Matter always belongs to the selected
// client (enforced server-side too, see /api/transactions/[id]/link).
// Never auto-claims: every link is an explicit staff selection here.
export function LinkDrawer({ transactionId, currentClientName }: { transactionId: string; currentClientName: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function search(q: string) {
    setQuery(q);
    setSelectedClient(null);
    setMatters([]);
    if (q.trim().length < 2) { setClientResults([]); return; }
    setClientResults(await apiFetch<ClientOption[]>(`/api/clients?search=${encodeURIComponent(q)}`));
  }

  async function pickClient(c: ClientOption) {
    setSelectedClient(c);
    setClientResults([]);
    setQuery(c.name);
    setMatters(await apiFetch<MatterOption[]>(`/api/matters?clientId=${c.id}`));
  }

  async function linkToClient() {
    if (!selectedClient) return;
    await performLink({ action: "LINK_CLIENT", clientId: selectedClient.id, reason: notes || undefined });
  }
  async function linkToMatter(matterId: string) {
    await performLink({ action: "LINK_MATTER", matterId, reason: notes || undefined });
  }
  async function unlink() {
    await performLink({ action: "UNLINK", reason: notes || undefined });
  }

  async function performLink(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/transactions/${transactionId}/link`, { method: "POST", body: JSON.stringify(body) });
      toast("success", "Transaksi berhasil dihubungkan ke matter.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Link</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div className="h-full w-full max-w-sm overflow-y-auto bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-semibold text-text">Link Transaction</h2>
            <p className="mb-5 text-sm text-muted">
              {currentClientName ? `Saat ini: ${currentClientName}` : "Saat ini: Unlinked — kalau belum jelas pemiliknya, tidak perlu di-link."}
            </p>

            <label className="mb-1 block text-xs font-medium text-text">Client</label>
            <input value={query} onChange={(e) => search(e.target.value)} placeholder="Cari client..." className="input mb-1" />
            {clientResults.length > 0 && (
              <ul className="mb-3 max-h-40 overflow-y-auto rounded-control border border-border bg-white shadow-sm">
                {clientResults.map((c) => (
                  <li key={c.id} onClick={() => pickClient(c)} className="cursor-pointer px-3 py-2 text-sm hover:bg-bg">{c.name}</li>
                ))}
              </ul>
            )}

            {selectedClient && (
              <div className="mb-4">
                <Button size="sm" variant="secondary" onClick={linkToClient} disabled={busy} className="mb-2 w-full">
                  Link ke Client &quot;{selectedClient.name}&quot; saja
                </Button>
                {matters.length > 0 && (
                  <>
                    <p className="mb-1 text-xs font-medium text-muted">atau pilih matter:</p>
                    <div className="flex flex-col gap-1">
                      {matters.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => linkToMatter(m.id)}
                          disabled={busy}
                          className="rounded-control border border-border px-3 py-2 text-left text-sm hover:bg-bg"
                        >
                          {m.matterName}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <label className="mb-1 block text-xs font-medium text-text">Notes (opsional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input mb-4 min-h-16" />

            {error && <p className="mb-3 text-sm text-danger">{error}</p>}

            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={unlink} disabled={busy}>Unlink</Button>
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Tutup</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
