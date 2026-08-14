// Pure "what happens if I click Simpan" preview for AllocateInline
// (src/components/TransactionActions.tsx). Deliberately plain `number`
// arithmetic — not Decimal.js — to match invoiceOutstanding() right next to
// its only caller, which already does the same plain-number math against
// the same values. This must never disagree with that existing calculation.
//
// Purely informational, same as invoiceOutstanding()/exceedsOutstanding
// before it: never used to block/disable submit. An over-allocation is
// still a valid, recordable state (CLAUDE.md §7 point 7) — this just shows
// staff the consequence before they click Simpan, it doesn't gate it.
export interface AllocationPreview {
  proposedAmount: number;
  paymentRemaining: number;
  invoiceRemaining: number;
  exceedsPayment: boolean;
  exceedsInvoice: boolean;
  exceedsPaymentBy: number; // 0 if not exceeded
  exceedsInvoiceBy: number; // 0 if not exceeded
}

// `proposedAmount` is expected to already be a finite number (the caller —
// AllocateInline — is responsible for not invoking this at all when the
// amount input is empty/zero/invalid; see the "don't show misleading zero"
// note there). If a non-finite value ever reaches here regardless, it's
// treated as 0 rather than propagating NaN into the UI.
export function computeAllocationPreview(
  availablePayment: number,
  invoiceOutstandingAmount: number,
  proposedAmount: number
): AllocationPreview {
  const proposed = Number.isFinite(proposedAmount) ? proposedAmount : 0;
  const paymentRemaining = availablePayment - proposed;
  const invoiceRemaining = invoiceOutstandingAmount - proposed;
  const exceedsPayment = proposed > availablePayment;
  const exceedsInvoice = proposed > invoiceOutstandingAmount;

  return {
    proposedAmount: proposed,
    paymentRemaining,
    invoiceRemaining,
    exceedsPayment,
    exceedsInvoice,
    exceedsPaymentBy: exceedsPayment ? proposed - availablePayment : 0,
    exceedsInvoiceBy: exceedsInvoice ? proposed - invoiceOutstandingAmount : 0,
  };
}
