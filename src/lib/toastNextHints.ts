// Pure, presentation-agnostic "what to do next" copy for success toasts
// (Objective P1 — Success → Next Action). Every hint here is deliberately
// optional/suggestive in tone ("jika sudah diketahui") — never imperative
// ("harus"/"wajib") — because CLAUDE.md §7 points 2/3 mean Client/Matter
// linkage and payment allocation are never forced, so a follow-up hint can
// never read as a requirement. No DOM/React here — these are called from
// client components right after their existing apiFetch(...) succeeds, see
// NewTransactionModal.tsx / LinkDrawer.tsx / TransactionActions.tsx.

export function transactionCreateNextHint(hasClientOrMatter: boolean): { text: string } | undefined {
  if (hasClientOrMatter) return undefined;
  return { text: "Link ke Client/Matter jika kepemilikannya sudah diketahui." };
}

export function classifyNextHint(financialType: string): { text: string } | undefined {
  if (financialType !== "PAYMENT") return undefined;
  return { text: "Alokasikan payment ini ke invoice jika sudah diketahui." };
}

export function linkToClientOnlyNextHint(matterCount: number): string | undefined {
  if (matterCount <= 0) return undefined;
  return "Link ke Matter jika sudah diketahui.";
}

export function allocationNextHint(params: {
  invoiceNumber: string;
  invoiceId: string;
  paymentId: string;
  showPaymentDetailLink: boolean;
}): { text: string; ctas: { label: string; href: string }[] } {
  const ctas: { label: string; href: string }[] = [
    { label: `Lihat Invoice ${params.invoiceNumber}`, href: `/invoices/${params.invoiceId}` },
  ];
  if (params.showPaymentDetailLink) {
    ctas.push({ label: "Lihat Payment", href: `/payments/${params.paymentId}` });
  }
  return { text: "Payment berhasil dialokasikan ke invoice.", ctas };
}
