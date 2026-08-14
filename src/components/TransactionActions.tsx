"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Typeahead } from "@/components/ui/Typeahead";
import { FieldHelp } from "@/components/ui/FieldHelp";
import { useModalFocusTrap } from "@/components/ui/useModalFocusTrap";
import { formatCurrency } from "@/lib/formatCurrency";
import { FIELD_HELP } from "@/lib/fieldHelp";
import { computeAllocationPreview } from "@/lib/allocationPreview";
import { classifyNextHint, allocationNextHint } from "@/lib/toastNextHints";

// "Record Payment/Deposit/Disbursement" (Section 10) is realized as
// classification of an existing UNCLASSIFIED transaction — see Step 4/13:
// PAYMENT/DEPOSIT/DISBURSEMENT are thin business labels over one
// financial_transaction, not separate creation flows.

// Roadmap #3 "Structured per-bank disbursement categorization". bankAccountId
// is Disbursement-only (doesn't apply to Payment/Deposit) and always
// OPTIONAL — CLAUDE.md §7 point 2 says financial linkage is never forced,
// so staff must be able to confirm DISBURSEMENT with nothing selected, same
// as before this field existed. Only fields actually used here are typed;
// the API returns more (notes/createdBy/timestamps) but they're irrelevant
// to this picker.
interface BankAccountOption {
  id: string;
  bankName: string;
  accountName: string | null;
  accountNumber: string | null;
  status: string;
}

export function ClassifyTransactionPanel({ transactionId, direction }: { transactionId: string; direction: "IN" | "OUT" }) {
  const [busy, setBusy] = useState<string | null>(null);
  // Disbursement-only inline picker state — mirrors AllocateInline's own
  // open/query/selected/fetch-on-open shape below, kept local to this
  // component rather than a new file since it's a single small field.
  const [disbursementOpen, setDisbursementOpen] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [bankQuery, setBankQuery] = useState("");
  const [selectedBankAccount, setSelectedBankAccount] = useState<BankAccountOption | null>(null);
  const router = useRouter();
  const toast = useToast();

  const options = direction === "IN" ? (["PAYMENT", "DEPOSIT"] as const) : (["DISBURSEMENT"] as const);

  useEffect(() => {
    if (!disbursementOpen) return;
    // INACTIVE accounts (retired/closed) aren't offered for new entries —
    // the route itself doesn't filter by status, so it's done client-side.
    apiFetch<BankAccountOption[]>("/api/bank-accounts").then((accounts) => setBankAccounts(accounts.filter((a) => a.status === "ACTIVE")));
  }, [disbursementOpen]);

  async function classify(financialType: string) {
    setBusy(financialType);
    try {
      await apiFetch(`/api/transactions/${transactionId}/classify`, { method: "POST", body: JSON.stringify({ financialType }) });
      const hint = classifyNextHint(financialType);
      toast("success", `Transaksi berhasil diklasifikasikan sebagai ${financialType}.`, hint && { next: hint.text });
      router.refresh();
    } catch (err) {
      toast("error", (err as Error).message || "Transaksi gagal disimpan. Tidak ada perubahan yang disimpan.");
    } finally {
      setBusy(null);
    }
  }

  function handleBankQueryChange(q: string) {
    setBankQuery(q);
    setSelectedBankAccount(null);
  }

  // Deliberately not folded into classify() above — keeps the PAYMENT/
  // DEPOSIT path (and classify() itself) byte-for-byte untouched. Same
  // endpoint + same toast/error/router.refresh() shape as classify(),
  // just with an optional bankAccountId riding along. selectedBankAccount
  // being null is a normal, expected case, not an error — omitted from the
  // body entirely (JSON.stringify drops undefined keys), never blocked.
  async function confirmDisbursement() {
    setBusy("DISBURSEMENT");
    try {
      await apiFetch(`/api/transactions/${transactionId}/classify`, {
        method: "POST",
        body: JSON.stringify({ financialType: "DISBURSEMENT", bankAccountId: selectedBankAccount?.id ?? undefined }),
      });
      toast("success", "Transaksi berhasil diklasifikasikan sebagai DISBURSEMENT.");
      setDisbursementOpen(false);
      router.refresh();
    } catch (err) {
      toast("error", (err as Error).message || "Transaksi gagal disimpan. Tidak ada perubahan yang disimpan.");
    } finally {
      setBusy(null);
    }
  }

  if (direction === "OUT") {
    if (!disbursementOpen) {
      return (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setDisbursementOpen(true)}>
            Classify as DISBURSEMENT
          </Button>
        </div>
      );
    }

    const filteredBankOptions = bankAccounts
      .filter((a) => {
        const q = bankQuery.toLowerCase();
        return a.bankName.toLowerCase().includes(q) || (a.accountName ?? "").toLowerCase().includes(q) || (a.accountNumber ?? "").toLowerCase().includes(q);
      })
      .map((a) => ({ value: a.id, label: [a.bankName, a.accountName, a.accountNumber].filter(Boolean).join(" — ") }));

    return (
      <div className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-white p-2">
        <div style={{ width: 220 }}>
          <Typeahead
            value={bankQuery}
            onChange={handleBankQueryChange}
            options={filteredBankOptions}
            onSelect={(opt) => {
              const account = bankAccounts.find((a) => a.id === opt.value);
              if (account) { setSelectedBankAccount(account); setBankQuery(account.bankName); }
            }}
            placeholder="Bank/rekening sumber dana (opsional)"
            emptyHint={bankAccounts.length === 0 ? "Belum ada bank account terdaftar — tetap bisa disimpan tanpa bank account." : "Tidak ada match."}
          />
        </div>
        <Button size="sm" onClick={confirmDisbursement} loading={busy === "DISBURSEMENT"}>Simpan</Button>
        <Button size="sm" variant="secondary" onClick={() => setDisbursementOpen(false)}>Batal</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* No label existed above this row before — added specifically because
          the PAYMENT vs DEPOSIT choice needs the "titipan, bukan sekadar
          PNBP/BPHTB" distinction explained somewhere (P1 item #7). Kept to a
          single small label line rather than restyling the button row. */}
      <div className="flex items-center gap-1 text-xs font-medium text-muted">
        <span>Classify as:</span>
        <FieldHelp content={FIELD_HELP.deposit} ariaLabel="Penjelasan Deposit" />
      </div>
      <div className="flex gap-2">
        {options.map((opt) => (
          <Button key={opt} size="sm" variant="secondary" onClick={() => classify(opt)} loading={busy === opt}>
            Classify as {opt}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function VoidTransactionButton({ transactionId }: { transactionId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const panelRef = useModalFocusTrap<HTMLDivElement>(open, () => setOpen(false));

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
          <div ref={panelRef} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-card bg-card p-6 shadow-lg border border-border">
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
  const panelRef = useModalFocusTrap<HTMLDivElement>(open, () => setOpen(false));

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
          <div ref={panelRef} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-card bg-card p-6 shadow-lg border border-border">
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

// totalAmount/allocations added for the remaining-balance indicator
// (PAINKILLER_COVERAGE_AUDIT.md §7.4, Roadmap #1) — GET /api/invoices now
// includes each invoice's ACTIVE allocations (additive field, see
// src/app/api/invoices/route.ts) so "sisa tagihan" can be computed here
// without a second endpoint. Decimal fields cross the JSON boundary as
// strings, same convention as GlobalSearch.tsx's search-result types.
interface AllocateInvoiceOption {
  id: string;
  invoiceNumber: string;
  totalAmount: string;
  allocations: { amount: string }[];
}

// Purely informational — never used to block/disable submit. The
// allocation rule is deliberately non-blocking (CLAUDE.md §7 point 7,
// PAINKILLER_COVERAGE_AUDIT.md §5 B.1): an over-allocation is still
// recorded and simply flagged REVIEW_REQUIRED by the backend, same as
// before this indicator existed.
function invoiceOutstanding(invoice: AllocateInvoiceOption): number {
  return Number(invoice.totalAmount) - invoiceAllocatedSoFar(invoice);
}

// Extracted from invoiceOutstanding() above rather than changing that
// function's signature (other callers/tests only need the outstanding
// figure) — the selected-invoice breakdown line in AllocateInline needs the
// intermediate "already allocated" sum too, so it's computed once here
// instead of via a second, slightly different .reduce() inline.
function invoiceAllocatedSoFar(invoice: AllocateInvoiceOption): number {
  return invoice.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
}

// Invoice picker was previously a raw text field requiring the exact
// invoice number typed from memory — a real daily-friction point since
// allocating a payment happens every time a client pays. Now a Typeahead
// (same deterministic, non-AI component used for Client/Cost Category
// search elsewhere) scoped to the payment's own matter when known, so the
// list is short and selection returns an id directly — no more "Invoice
// tidak ditemukan" from a typo.
// `unallocated` used to arrive pre-formatted (`formatCurrency()` at the call
// site) — it's now a raw number so the live preview below can do arithmetic
// with it, and formatted here with the same formatCurrency() wherever it's
// displayed. Both call sites (payments/[id]/page.tsx, TransactionTraceView)
// updated accordingly.
export function AllocateInline({
  paymentId,
  unallocated,
  matterId,
  showPaymentDetailLink = false,
}: {
  paymentId: string;
  unallocated: number;
  matterId?: string | null;
  // Default false: most call sites (e.g. payments/[id]/page.tsx) already
  // ARE the payment detail page, so a "Lihat Payment" CTA there would be
  // self-referential. TransactionTraceView.tsx passes true.
  showPaymentDetailLink?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [invoices, setInvoices] = useState<AllocateInvoiceOption[]>([]);
  const [query, setQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<AllocateInvoiceOption | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    apiFetch<AllocateInvoiceOption[]>(`/api/invoices${matterId ? `?matterId=${matterId}` : ""}`).then(setInvoices);
  }, [open, matterId]);

  function handleQueryChange(q: string) {
    setQuery(q);
    setSelectedInvoice(null);
  }

  async function submit() {
    if (!selectedInvoice) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/payments/${paymentId}/allocate`, {
        method: "POST",
        body: JSON.stringify({ invoiceId: selectedInvoice.id, allocationType: "INVOICE_PAYMENT", amount: Number(amount) }),
      });
      const hint = allocationNextHint({
        invoiceNumber: selectedInvoice.invoiceNumber,
        invoiceId: selectedInvoice.id,
        paymentId,
        showPaymentDetailLink,
      });
      toast("success", hint.text, { cta: hint.ctas });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Allocate (sisa {formatCurrency(unallocated)})</Button>;
  }

  const filteredOptions = invoices
    .filter((i) => i.invoiceNumber.toLowerCase().includes(query.toLowerCase()))
    .map((i) => ({ value: i.id, label: i.invoiceNumber }));

  // Live-recomputed on every render from selectedInvoice/amount state — no
  // extra effect needed, updates automatically when staff picks a different
  // invoice or edits the amount. No network request: everything here comes
  // from `invoices` (already fetched once when the widget opened) and local
  // `amount` state, purely derived — never persisted, never appears as if
  // already committed before Simpan is clicked.
  const outstanding = selectedInvoice ? invoiceOutstanding(selectedInvoice) : null;
  const allocatedSoFar = selectedInvoice ? invoiceAllocatedSoFar(selectedInvoice) : null;
  const parsedAmount = amount !== "" ? Number(amount) : null;
  // "Don't show a misleading zero" lives here, in the caller, not inside
  // computeAllocationPreview() — the pure function itself is only ever
  // invoked once we already know there's a real, non-zero amount typed.
  const preview =
    outstanding !== null && parsedAmount !== null && parsedAmount > 0
      ? computeAllocationPreview(unallocated, outstanding, parsedAmount)
      : null;

  return (
    // Keyboard-first audit finding: this was a plain <div> with an
    // onClick-only Simpan button, so Enter after typing an amount did
    // nothing at all (not even the "wrong button" case the audit was
    // looking for — no button fired). Wrapped in a real <form> so Enter
    // submits the primary action, matching every other data-entry form in
    // the app (e.g. NewTransactionModal.tsx). Unlike the 3 destructive
    // modals in this same file, allocation isn't destructive/irreversible
    // from a single Enter press (ReverseAllocationButton exists for that),
    // so there's no reason to withhold a real <form> here.
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-white p-2"
    >
      <div style={{ width: 160 }}>
        <Typeahead
          value={query}
          onChange={handleQueryChange}
          options={filteredOptions}
          onSelect={(opt) => {
            const inv = invoices.find((i) => i.id === opt.value);
            if (inv) { setSelectedInvoice(inv); setQuery(inv.invoiceNumber); }
          }}
          placeholder="Cari No. Invoice..."
          emptyHint={invoices.length === 0 ? "Belum ada invoice." : "Tidak ada match."}
        />
      </div>
      <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="input" style={{ width: 120 }} />
      <FieldHelp content={FIELD_HELP.allocationAmount} ariaLabel="Penjelasan Allocation Amount" />
      <Button type="submit" size="sm" loading={busy} disabled={!selectedInvoice}>Simpan</Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
      {selectedInvoice && outstanding !== null && allocatedSoFar !== null && (
        <p className="w-full text-xs text-muted">
          Total invoice {formatCurrency(selectedInvoice.totalAmount)} · Sudah dialokasikan {formatCurrency(allocatedSoFar)} · Sisa{" "}
          <span className="font-medium text-text">{formatCurrency(outstanding)}</span>
        </p>
      )}
      {/* Live "after this allocation" preview — quiet by default (neutral
          text, no icon/banner) when within limits, see task spec. Informational
          only — never blocks/disables submit, same as invoiceOutstanding() above. */}
      {preview && (
        <p className="w-full text-xs text-muted">
          Setelah alokasi — Payment tersisa: <span className="font-medium text-text">{formatCurrency(preview.paymentRemaining)}</span>
          {" · "}Sisa invoice: <span className="font-medium text-text">{formatCurrency(preview.invoiceRemaining)}</span>
        </p>
      )}
      {preview?.exceedsPayment && (
        <p className="w-full text-xs text-warning">
          {"⚠"} Alokasi melebihi payment yang tersedia sebesar {formatCurrency(preview.exceedsPaymentBy)}.
        </p>
      )}
      {preview?.exceedsInvoice && (
        <p className="w-full text-xs text-warning">
          {"⚠"} Alokasi melebihi sisa invoice sebesar {formatCurrency(preview.exceedsInvoiceBy)}.
        </p>
      )}
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </form>
  );
}

// Roadmap #2 "Clearer payment correction workflow". There is still no
// in-place edit of amount/date/description (PROJECT_RULES.md §1 constraint
// 5) — this calls the thin convenience endpoint that voids the current
// transaction and creates a replacement in one request, same
// void+create composition staff would otherwise do by hand across two
// screens. Fields are pre-filled from the original transaction so
// "correcting" only requires changing what was actually wrong.
export function CorrectPaymentButton({
  paymentId,
  currentAmount,
  currentDate,
  currentDescription,
}: {
  paymentId: string;
  currentAmount: number;
  currentDate: string;
  currentDescription: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [newAmount, setNewAmount] = useState(String(currentAmount));
  const [newTransactionDate, setNewTransactionDate] = useState(currentDate);
  const [newDescription, setNewDescription] = useState(currentDescription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  function close() {
    setOpen(false);
    setReason("");
    setNewAmount(String(currentAmount));
    setNewTransactionDate(currentDate);
    setNewDescription(currentDescription);
    setError(null);
  }

  const panelRef = useModalFocusTrap<HTMLDivElement>(open, close);

  async function submit() {
    if (!reason.trim() || !newAmount || Number(newAmount) <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/payments/${paymentId}/correct`, {
        method: "POST",
        body: JSON.stringify({
          reason,
          newAmount: Number(newAmount),
          newTransactionDate: newTransactionDate || undefined,
          newDescription: newDescription.trim() || undefined,
        }),
      });
      toast("success", "Payment berhasil dikoreksi: transaksi lama di-void, transaksi baru dibuat.");
      close();
      router.refresh();
    } catch (err) {
      // HAS_ACTIVE_ALLOCATIONS / ALREADY_VOIDED / VALIDATION_ERROR all arrive
      // as an already human-readable Indonesian message from the API — shown
      // as-is, never replaced with a generic fallback (same pass-through
      // pattern as VoidTransactionButton/ReverseAllocationButton above). This
      // is how "payment masih punya alokasi aktif" reaches the user as a
      // clear, specific reason instead of a generic error.
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Correct this payment</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div ref={panelRef} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-card bg-card p-6 shadow-lg border border-border">
            <h2 className="mb-1 text-lg font-semibold text-text">Correct Payment</h2>
            <p className="mb-4 text-sm text-muted">
              Transaksi lama akan di-void (bukan diedit langsung) dan transaksi baru dibuat dengan client/matter/klasifikasi
              yang sama — audit trail tetap lengkap, sesuai prinsip financial fact tidak pernah diubah setelah dicatat.
            </p>

            <label className="mb-1 block text-xs font-medium text-text">Alasan Koreksi</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: nominal salah input saat pencatatan awal."
              className="input mb-3 min-h-16"
            />

            <label className="mb-1 block text-xs font-medium text-text">Jumlah yang Benar</label>
            <input
              type="number"
              min={1}
              step="0.01"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="input mb-3"
            />

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text">Tanggal Transaksi</label>
                <input type="date" value={newTransactionDate} onChange={(e) => setNewTransactionDate(e.target.value)} className="input" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text">Deskripsi</label>
                <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="input" />
              </div>
            </div>

            {error && <p className="mb-3 text-xs text-danger">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={close}>Batal</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={submit}
                loading={busy}
                disabled={!reason.trim() || !newAmount || Number(newAmount) <= 0}
              >
                Correct Payment
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
