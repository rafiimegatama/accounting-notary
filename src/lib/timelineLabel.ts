// Turns a raw audit_log row into the human-readable timeline lines the
// master prompt's Step 17 example shows ("[date] Created", "[date] Linked
// to Matter", ...). This is presentation logic only — the underlying data
// is the same audit_log used for the Audit table on the same screen.
export function describeTimelineEvent(entry: {
  entityType: string;
  action: string;
  newValue: unknown;
}): string {
  const newVal = (entry.newValue ?? {}) as Record<string, unknown>;

  switch (entry.entityType) {
    case "FINANCIAL_TRANSACTION":
      switch (entry.action) {
        case "CREATE": return "Transaksi dicatat";
        case "LINK": return newVal.matterId ? "Linked to Matter" : "Linked to Client";
        case "RELINK": return "Relinked ke Client/Matter lain";
        case "UNLINK": return "Unlinked";
        case "UPDATE": return "Metadata transaksi diperbarui";
        case "STATUS_CHANGE": return `Review status diubah menjadi ${newVal.reviewStatus ?? "?"}`;
        case "VOID": return "Transaksi di-void";
        default: return entry.action;
      }
    case "PAYMENT": return entry.action === "CREATE" ? "Diklasifikasikan sebagai Payment" : entry.action;
    case "DEPOSIT": return entry.action === "CREATE" ? "Diklasifikasikan sebagai Deposit" : entry.action;
    case "DISBURSEMENT": return entry.action === "CREATE" ? "Diklasifikasikan sebagai Disbursement" : entry.action;
    case "PAYMENT_ALLOCATION":
      return entry.action === "ALLOCATE" ? "Dialokasikan ke invoice" : entry.action === "REVERSE_ALLOCATION" ? "Alokasi di-reverse" : entry.action;
    case "FINANCIAL_ATTACHMENT": return "Dokumen dilampirkan";
    default: return `${entry.action} — ${entry.entityType}`;
  }
}
