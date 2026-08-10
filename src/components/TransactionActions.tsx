"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

// "Record Payment/Deposit/Disbursement" (Section 10) is realized as
// classification of an existing UNCLASSIFIED transaction — see Step 4/13:
// PAYMENT/DEPOSIT/DISBURSEMENT are thin business labels over one
// financial_transaction, not separate creation flows.
export function ClassifyTransactionPanel({ transactionId, direction }: { transactionId: string; direction: "IN" | "OUT" }) {
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  const options = direction === "IN" ? (["PAYMENT", "DEPOSIT"] as const) : (["DISBURSEMENT"] as const);

  async function classify(financialType: string) {
    setBusy(financialType);
    try {
      await apiFetch(`/api/transactions/${transactionId}/classify`, { method: "POST", body: JSON.stringify({ financialType }) });
      toast("success", `Transaksi diklasifikasikan sebagai ${financialType}.`);
      router.refresh();
    } catch (err) {
      toast("error", (err as Error).message || "Transaksi gagal disimpan. Tidak ada perubahan yang disimpan.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <Button key={opt} size="sm" variant="secondary" onClick={() => classify(opt)} loading={busy === opt}>
          Classify as {opt}
        </Button>
      ))}
    </div>
  );
}

export function VoidTransactionButton({ transactionId }: { transactionId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function submit() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/api/transactions/${transactionId}/void`, { method: "POST", body: JSON.stringify({ reason }) });
      toast("success", "Transaksi berhasil di-void.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>Void</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-card bg-card p-6 shadow-lg border border-border">
            <h2 className="mb-1 text-lg font-semibold text-text">Void Transaction</h2>
            <p className="mb-4 text-sm text-muted">Transaksi tidak dihapus — hanya ditandai VOIDED dan dikeluarkan dari semua perhitungan. Wajib isi alasan.</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan void..." className="input mb-4 min-h-16" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Batal</Button>
              <Button variant="danger" size="sm" onClick={submit} loading={busy} disabled={!reason.trim()}>Void Transaksi</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ReverseAllocationButton({ allocationId }: { allocationId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function submit() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/api/payment-allocations/${allocationId}/reverse`, { method: "POST", body: JSON.stringify({ reason }) });
      toast("success", "Alokasi berhasil di-reverse.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-danger hover:underline">Reverse</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-card bg-card p-6 shadow-lg border border-border">
            <h2 className="mb-1 text-lg font-semibold text-text">Reverse Allocation</h2>
            <p className="mb-4 text-sm text-muted">Wajib isi alasan koreksi.</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="input mb-4 min-h-16" placeholder="Alasan..." />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Batal</Button>
              <Button variant="danger" size="sm" onClick={submit} loading={busy} disabled={!reason.trim()}>Reverse</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function AllocateInline({ paymentId, unallocated }: { paymentId: string; unallocated: string }) {
  const [open, setOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const invoices = await apiFetch<{ id: string; invoiceNumber: string }[]>(`/api/invoices`);
      const invoice = invoices.find((i) => i.invoiceNumber === invoiceNumber);
      if (!invoice) throw new Error("Invoice tidak ditemukan. Pastikan nomor invoice benar.");
      await apiFetch(`/api/payments/${paymentId}/allocate`, {
        method: "POST",
        body: JSON.stringify({ invoiceId: invoice.id, allocationType: "INVOICE_PAYMENT", amount: Number(amount) }),
      });
      toast("success", "Payment berhasil dialokasikan.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Allocate (sisa {unallocated})</Button>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-white p-2">
      <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="No. Invoice" className="input" style={{ width: 140 }} />
      <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="input" style={{ width: 120 }} />
      <Button size="sm" onClick={submit} loading={busy}>Simpan</Button>
      <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}
