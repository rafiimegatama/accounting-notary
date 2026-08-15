"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { Button } from "@/components/ui/Button";
import { useModalFocusTrap } from "@/components/ui/useModalFocusTrap";

interface StaffRow {
  id: string;
  name: string;
  isAdmin: boolean;
}

// Settings > Staf Aktif. Reset PIN is only rendered for a viewer whose own
// account has isAdmin=true — pure UX convenience, NOT the security boundary
// (POST /api/staff/[id]/reset-pin re-checks this server-side against the
// DB regardless, same "session presence is UX only" principle used
// throughout this app). isAdmin gates only this one action — see
// schema.prisma's Staff model comment.
export function StaffList({ staff, viewerIsAdmin }: { staff: StaffRow[]; viewerIsAdmin: boolean }) {
  return (
    <ul className="divide-y divide-border text-sm">
      {staff.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 py-2">
          <span className="flex items-center gap-2">
            {s.name}
            {s.isAdmin && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-primary">Admin</span>
            )}
          </span>
          {viewerIsAdmin && <ResetPinButton staffId={s.id} staffName={s.name} />}
        </li>
      ))}
    </ul>
  );
}

function ResetPinButton({ staffId, staffName }: { staffId: string; staffName: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPin, setNewPin] = useState<string | null>(null);
  const router = useRouter();

  function close() {
    const didReset = newPin !== null;
    setOpen(false);
    setError(null);
    setNewPin(null);
    if (didReset) router.refresh();
  }

  const panelRef = useModalFocusTrap<HTMLDivElement>(open, close);

  async function confirmReset() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ newPin: string; targetName: string }>(`/api/staff/${staffId}/reset-pin`, {
        method: "POST",
        body: JSON.stringify({ reason: "Staf lupa PIN" }),
      });
      setNewPin(result.newPin);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Reset PIN
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-pin-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-card border border-border bg-card p-6 shadow-lg"
          >
            {!newPin ? (
              <>
                <h2 id="reset-pin-title" className="mb-2 text-lg font-semibold text-text">
                  Reset PIN &mdash; {staffName}
                </h2>
                <p className="mb-4 text-sm text-muted">
                  PIN baru akan dibuat otomatis dan hanya ditampilkan sekali di layar ini. Sampaikan langsung ke{" "}
                  {staffName} setelah ini &mdash; PIN lama {staffName} akan langsung berhenti berfungsi.
                </p>
                {error && <p className="mb-3 text-sm text-danger">{error}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={close} disabled={busy}>Batal</Button>
                  <Button variant="danger" loading={busy} onClick={confirmReset}>Reset PIN</Button>
                </div>
              </>
            ) : (
              <>
                <h2 id="reset-pin-title" className="mb-2 text-lg font-semibold text-text">
                  PIN Baru &mdash; {staffName}
                </h2>
                <p className="mb-1 text-xs text-muted">
                  Catat atau sampaikan sekarang &mdash; PIN ini tidak akan ditampilkan lagi setelah ditutup.
                </p>
                <p className="mb-4 rounded-control border border-border bg-bg px-4 py-3 text-center font-mono text-2xl tracking-widest text-text">
                  {newPin}
                </p>
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={close}>Tutup</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
