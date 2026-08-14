// Phase 8/10 "exception explanation": deterministic (no AI, no LLM-generated
// wording) mapping from the exact `why` strings recomputeReviewStatus()
// already writes into audit_log.reason (src/lib/exceptionRules.ts) to a
// plain-language suggested next step. Pattern-matched against the existing
// reason text — this does not introduce a second copy of the rule table,
// it only adds a "what can I do" layer on top of the "why" that already
// exists. Unrecognized reasons (e.g. a manually-set REVIEW_REQUIRED with a
// staff-written reason) simply get no suggestion, never a guessed one.
export function suggestedActionForReason(reason: string | null): string | null {
  if (!reason) return null;
  if (reason.includes("belum dialokasikan")) {
    return "Alokasikan sisa payment ke invoice yang sesuai.";
  }
  if (reason.includes("melebihi jumlah payment") || reason.includes("Overpayment")) {
    return "Tinjau alokasi — kemungkinan perlu dikurangi, atau memang overpayment yang disengaja.";
  }
  if (reason.includes("tidak mengizinkan partial payment")) {
    return "Tinjau apakah partial payment ini disengaja, atau invoice perlu diperbarui agar mengizinkannya.";
  }
  return null;
}
