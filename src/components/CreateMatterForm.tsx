"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { useModalFocusTrap } from "@/components/ui/useModalFocusTrap";

interface CreatedMatterResponse {
  id: string;
}

// Same modal shape as AddCostDetailModal/CreateInvoiceModal — matterName
// is the only required field (POST /api/matters already only requires
// clientId + matterName), the rest optional. This endpoint existed and
// was already exercised by the demo seed script, but no UI anywhere
// called it: there was no way to create a Matter from the app at all.
export function CreateMatterForm({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [matterName, setMatterName] = useState("");
  const [matterType, setMatterType] = useState("");
  const [responsibleStaff, setResponsibleStaff] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  // Redundant autoFocus below removed — the hook already focuses the first
  // focusable descendant (the matterName input) when the modal opens.
  const panelRef = useModalFocusTrap<HTMLFormElement>(open, () => setOpen(false));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<CreatedMatterResponse>("/api/matters", {
        method: "POST",
        body: JSON.stringify({
          clientId,
          matterName,
          matterType: matterType || undefined,
          responsibleStaff: responsibleStaff || undefined,
        }),
      });
      toast("success", "Matter berhasil dibuat.", {
        next: "Lihat matter untuk mulai menambahkan rincian biaya atau invoice.",
        cta: [{ label: "Lihat Matter", href: `/matters/${created.id}` }],
      });
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
      <Button size="sm" onClick={() => setOpen(true)}>+ Matter baru</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <form ref={panelRef} onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-md rounded-card bg-card p-6 shadow-lg border border-border">
            <h2 className="mb-4 text-lg font-semibold text-text">Matter Baru</h2>
            <label className="mb-1 block text-xs font-medium text-text">Nama Matter</label>
            <input required value={matterName} onChange={(e) => setMatterName(e.target.value)} placeholder="mis. Akta Jual Beli Tanah Kavling No. 12" className="input mb-3" />
            <label className="mb-1 block text-xs font-medium text-text">Jenis Matter (opsional)</label>
            <input value={matterType} onChange={(e) => setMatterType(e.target.value)} placeholder="mis. Akta Jual Beli, Pendirian PT" className="input mb-3" />
            <label className="mb-1 block text-xs font-medium text-text">Staf Penanggung Jawab (opsional)</label>
            <input value={responsibleStaff} onChange={(e) => setResponsibleStaff(e.target.value)} className="input mb-4" />

            {error && <p className="mb-3 text-sm text-danger">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" size="sm" loading={busy} disabled={!matterName.trim()}>Simpan</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
