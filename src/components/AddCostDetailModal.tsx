"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { SOURCE_TYPES } from "@/lib/enums";

export function AddCostDetailModal({ matterId }: { matterId: string }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sourceType, setSourceType] = useState("MANUAL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/cost-details", {
        method: "POST",
        body: JSON.stringify({ matterId, description, category: category || undefined, amount: Number(amount), costDate: date, sourceType }),
      });
      toast("success", "Cost detail berhasil ditambahkan.");
      setOpen(false);
      setDescription(""); setCategory(""); setAmount("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>+ Add Cost</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-md rounded-card bg-card p-6 shadow-lg border border-border">
            <h2 className="mb-4 text-lg font-semibold text-text">Add Cost Detail</h2>
            <label className="mb-1 block text-xs font-medium text-text">Description</label>
            <input required value={description} onChange={(e) => setDescription(e.target.value)} className="input mb-3" />
            <label className="mb-1 block text-xs font-medium text-text">Category</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="mis. PNBP, BPHTB, Honorarium" className="input mb-3" />
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text">Amount</label>
                <input required type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text">Date</label>
                <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
              </div>
            </div>
            <label className="mb-1 block text-xs font-medium text-text">Source</label>
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="input mb-4">
              {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {error && <p className="mb-3 text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" loading={busy}>Simpan</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
