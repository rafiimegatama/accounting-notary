"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Typeahead } from "@/components/ui/Typeahead";
import { useModalFocusTrap } from "@/components/ui/useModalFocusTrap";
import { linkToClientOnlyNextHint } from "@/lib/toastNextHints";
import { getRecentClients, getRecentMattersForClient, recordRecentClient, recordRecentMatter } from "@/lib/recentSelections";

interface ClientOption { id: string; name: string }
interface MatterOption { id: string; matterName: string }

const UNDO_WINDOW_MS = 10_000;

// Reconstructs the /link request body that would restore whatever state
// preceded the action just taken — same endpoint, same LINK_CLIENT /
// LINK_MATTER / UNLINK vocabulary, no separate "undo" concept server-side.
function actionForState(clientId: string | null, matterId: string | null): Record<string, unknown> {
  if (matterId) return { action: "LINK_MATTER", matterId };
  if (clientId) return { action: "LINK_CLIENT", clientId };
  return { action: "UNLINK" };
}

// Section 14 Link Workflow: UNLINKED → Client, UNLINKED → Matter, Client →
// Matter — all via this one drawer. Matter always belongs to the selected
// client (enforced server-side too, see /api/transactions/[id]/link).
// Never auto-claims: every link is an explicit staff selection here.
//
// Undo: after a successful link/relink/unlink, the trigger button is
// replaced in place by "<message> [Undo]" for 10s, then reverts to the
// normal button. Deliberately inline (per-row) rather than a floating
// toast — a floating "N pending undos" stack gets noisy fast when staff
// process many rows back to back in Review Center, since each row's state
// here is independent, nothing stacks globally. No redo: undoing by
// mistake just means re-linking again through the normal drawer, which
// stays fully available at any time (linking is never destructive/never
// time-limited — the 10s window is a convenience shortcut, not the only
// way to correct a mistake).
export function LinkDrawer({
  transactionId,
  currentClientName,
  currentMatterName,
  currentClientId,
  currentMatterId,
}: {
  transactionId: string;
  currentClientName: string | null;
  currentMatterName?: string | null;
  currentClientId?: string | null;
  currentMatterId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ message: string; previousBody: Record<string, unknown>; nextHint?: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const toast = useToast();
  const panelRef = useModalFocusTrap<HTMLDivElement>(open, () => setOpen(false));

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  useEffect(() => {
    if (selectedClient || query.trim().length < 2) { setClientResults([]); return; }
    const t = setTimeout(async () => {
      setClientResults(await apiFetch<ClientOption[]>(`/api/clients?search=${encodeURIComponent(query)}`));
    }, 250);
    return () => clearTimeout(t);
  }, [query, selectedClient]);

  function handleQueryChange(q: string) {
    setQuery(q);
    setSelectedClient(null);
    setMatters([]);
  }

  async function pickClient(c: ClientOption) {
    setSelectedClient(c);
    setClientResults([]);
    setQuery(c.name);
    setMatters(await apiFetch<MatterOption[]>(`/api/matters?clientId=${c.id}`));
    recordRecentClient({ id: c.id, name: c.name });
  }

  async function linkToClient() {
    if (!selectedClient) return;
    await performLink(
      { action: "LINK_CLIENT", clientId: selectedClient.id, reason: notes || undefined },
      `Linked ke ${selectedClient.name}`,
      linkToClientOnlyNextHint(matters.length)
    );
  }
  async function linkToMatter(matterId: string) {
    const matter = matters.find((m) => m.id === matterId);
    if (matter && selectedClient) {
      recordRecentMatter({ id: matter.id, matterName: matter.matterName, clientId: selectedClient.id, clientName: selectedClient.name });
    }
    await performLink({ action: "LINK_MATTER", matterId, reason: notes || undefined }, `Linked ke ${matter?.matterName ?? "matter"}`);
  }
  async function unlink() {
    await performLink({ action: "UNLINK", reason: notes || undefined }, "Unlinked");
  }

  async function performLink(body: Record<string, unknown>, successMessage: string, nextHint?: string) {
    setBusy(true);
    setError(null);
    const previousBody = actionForState(currentClientId ?? null, currentMatterId ?? null);
    try {
      await apiFetch(`/api/transactions/${transactionId}/link`, { method: "POST", body: JSON.stringify(body) });
      setOpen(false);
      router.refresh();
      showUndo(successMessage, previousBody, nextHint);
    } catch (err) {
      setError((err as Error).message);
      toast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function showUndo(message: string, previousBody: Record<string, unknown>, nextHint?: string) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ message, previousBody, nextHint });
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
  }

  async function handleUndo() {
    if (!undo) return;
    setBusy(true);
    try {
      await apiFetch(`/api/transactions/${transactionId}/link`, { method: "POST", body: JSON.stringify(undo.previousBody) });
      router.refresh();
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndo(null);
      setBusy(false);
    }
  }

  // Recent Matter for the selected client only, cross-referenced against the
  // just-fetched `matters` list so a stale recent entry (matter no longer
  // exists) silently drops out rather than rendering a dead button — same
  // "fail gracefully" rule as NewTransactionModal.tsx's own computation.
  const recentMatters = selectedClient
    ? getRecentMattersForClient(selectedClient.id)
        .map((rm) => matters.find((m) => m.id === rm.id))
        .filter((m): m is MatterOption => Boolean(m))
    : [];
  const recentMatterIds = new Set(recentMatters.map((m) => m.id));
  const otherMatters = matters.filter((m) => !recentMatterIds.has(m.id));

  function matterButton(m: MatterOption) {
    return (
      <button
        key={m.id}
        onClick={() => linkToMatter(m.id)}
        disabled={busy}
        className="rounded-control border border-border px-3 py-2 text-left text-sm hover:bg-bg"
      >
        {m.matterName}
      </button>
    );
  }

  return (
    <>
      {undo ? (
        <div className="inline-flex items-center gap-2 text-xs">
          <span className="text-success">{undo.message}</span>
          {undo.nextHint && <span className="text-muted">{undo.nextHint}</span>}
          <button onClick={handleUndo} disabled={busy} className="font-medium text-primary hover:underline disabled:opacity-50">
            Undo
          </button>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Link</Button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div ref={panelRef} className="h-full w-full max-w-sm overflow-y-auto bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-semibold text-text">Link Transaction</h2>
            {/* Phase 2.1/2.2: Client and Matter are shown as two distinct
                states, not one combined message — "client known, matter
                unknown" is a legitimate state, different from "both
                unknown," and staff should see that difference at a glance. */}
            <div className="mb-5 grid grid-cols-2 gap-3 rounded-control border border-border bg-bg px-3 py-2 text-sm">
              <div>
                <div className="text-xs font-medium text-muted">Client</div>
                <div className={currentClientName ? "text-text" : "text-muted"}>{currentClientName ?? "Belum teridentifikasi"}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted">Matter</div>
                <div className={currentMatterName ? "text-text" : "text-muted"}>{currentMatterName ?? "Belum teridentifikasi"}</div>
              </div>
            </div>
            {!currentClientName && (
              <p className="mb-5 text-xs text-muted">
                Unlinked itu valid — kalau belum jelas pemiliknya, tidak perlu di-link sekarang. Bisa &quot;Selesaikan nanti&quot; di bawah.
              </p>
            )}

            <label className="mb-1 block text-xs font-medium text-text" htmlFor="link-client">Client</label>
            <div className="mb-3">
              <Typeahead
                id="link-client"
                value={query}
                onChange={handleQueryChange}
                options={clientResults.map((c) => ({ value: c.id, label: c.name }))}
                // Built directly from the option, not looked up in
                // `clientResults` — a Recent option isn't a search result,
                // so it would never be found there. Same pickClient() call
                // either way (label is always the client's `name`).
                onSelect={(opt) => pickClient({ id: opt.value, name: opt.label })}
                placeholder="Cari client..."
                emptyHint={query.trim().length >= 2 && !selectedClient ? "Tidak ada match." : undefined}
                recentOptions={getRecentClients().map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>

            {selectedClient && (
              <div className="mb-4">
                <Button size="sm" variant="secondary" onClick={linkToClient} disabled={busy} className="mb-2 w-full">
                  Link ke Client &quot;{selectedClient.name}&quot; saja
                </Button>
                {matters.length > 0 && (
                  <>
                    <p className="mb-1 text-xs font-medium text-muted">atau pilih matter:</p>
                    {recentMatters.length > 0 && (
                      <>
                        <p className="mb-1 text-xs font-medium text-muted">Recent</p>
                        <div className="mb-2 flex flex-col gap-1">{recentMatters.map(matterButton)}</div>
                      </>
                    )}
                    {otherMatters.length > 0 && (
                      <div className="flex flex-col gap-1">{otherMatters.map(matterButton)}</div>
                    )}
                  </>
                )}
              </div>
            )}

            <label className="mb-1 block text-xs font-medium text-text">Notes (opsional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input mb-4 min-h-16" />

            {error && <p className="mb-3 text-sm text-danger">{error}</p>}

            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={unlink} disabled={busy}>Unlink</Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setOpen(false)}
                title="Transaksi tetap tersimpan apa adanya — tidak ada perubahan, bisa dilanjutkan kapan saja."
              >
                Selesaikan nanti
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
