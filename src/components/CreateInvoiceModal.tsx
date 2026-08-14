"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { FieldHelp } from "@/components/ui/FieldHelp";
import { useModalFocusTrap } from "@/components/ui/useModalFocusTrap";
import { FIELD_HELP } from "@/lib/fieldHelp";

// Roadmap #1 (Sequential invoice numbering): shapes match
// GET /api/invoices?suggestNext=true and the additive sequenceWarning field
// on POST /api/invoices — see src/app/api/invoices/route.ts.
interface SuggestNextInvoiceNumberResponse {
  suggestedInvoiceNumber: string | null;
  year: number;
}

interface CreatedInvoiceResponse {
  id: string;
  sequenceWarning: string | null;
}

export function CreateInvoiceModal({ matterId }: { matterId: string }) {
  const [open, setOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [suggested, setSuggested] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [allowPartial, setAllowPartial] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const panelRef = useModalFocusTrap<HTMLFormElement>(open, () => setOpen(false));

  // Only ever a prefill suggestion continuing whatever numbering pattern
  // already exists server-side — never forced, still a plain editable text
  // field, and only offered once per open so it doesn't clobber the user
  // mid-edit. Server is the source of truth for the suggestion (Roadmap
  // #1); it returns null (never an invented "...-001") when nothing exists
  // yet for the current year, so the field is simply left blank then.
  async function openModal() {
    setOpen(true);
    if (invoiceNumber) return;
    try {
      const { suggestedInvoiceNumber } = await apiFetch<SuggestNextInvoiceNumberResponse>("/api/invoices?suggestNext=true");
      if (suggestedInvoiceNumber) {
        setInvoiceNumber(suggestedInvoiceNumber);
        setSuggested(true);
      }
    } catch {
      // Suggestion is a convenience only — silently leave the field blank on failure.
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<CreatedInvoiceResponse>("/api/invoices", {
        method: "POST",
        body: JSON.stringify({
          matterId,
          invoiceNumber,
          invoiceDate,
          dueDate: dueDate || undefined,
          totalAmount: Number(totalAmount),
          allowPartialPayment: allowPartial,
        }),
      });
      toast("success", "Invoice berhasil dibuat.", {
        next: "Lihat invoice untuk detail lebih lanjut.",
        cta: [{ label: "Lihat Invoice", href: `/invoices/${created.id}` }],
      });
      // Non-blocking per CLAUDE.md §7 point 7: invoice is already created
      // successfully at this point — this is informational only, never an error.
      if (created.sequenceWarning) {
        toast("warning", created.sequenceWarning);
      }
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
      <Button variant="secondary" size="sm" onClick={openModal}>+ Create Invoice</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <form ref={panelRef} onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-md rounded-card bg-card p-6 shadow-lg border border-border">
            <h2 className="mb-4 text-lg font-semibold text-text">Create Invoice</h2>
            <label className="mb-1 block text-xs font-medium text-text">Invoice Number</label>
            <input
              required
              value={invoiceNumber}
              onChange={(e) => { setInvoiceNumber(e.target.value); setSuggested(false); }}
              className="input mb-1"
            />
            <p className="mb-3 text-xs text-muted">{suggested ? "Disarankan otomatis melanjutkan urutan — bisa diubah bebas." : " "}</p>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text">Invoice Date</label>
                <input required type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="input" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text">Due Date</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
              </div>
            </div>
            <label className="mb-1 block text-xs font-medium text-text">Total Amount</label>
            <input required type="number" min={1} value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="input mb-3" />
            <label className="flex items-center gap-2 text-sm text-text mb-4">
              <input type="checkbox" checked={allowPartial} onChange={(e) => setAllowPartial(e.target.checked)} />
              Izinkan partial payment
              <FieldHelp content={FIELD_HELP.allowPartialPayment} ariaLabel="Penjelasan Allow Partial Payment" />
            </label>
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
