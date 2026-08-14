"use client";

import { Button } from "@/components/ui/Button";

// Small client island so `window.print()` can be wired from
// FinancialPositionView.tsx, which is a Server Component (same pattern as
// LiteModeToggle.tsx). Native browser print + the print stylesheet in
// globals.css/FinancialPositionView.tsx is the entire "PDF export" — no
// rendering library, no server round-trip; "Save as PDF" in the browser's
// own print dialog is the intended path to a handoff-able file.
// `print:hidden` on the button itself keeps it out of the printed output.
export function PrintReportButton() {
  return (
    <Button type="button" variant="secondary" size="sm" className="print:hidden" onClick={() => window.print()}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9V2h12v7" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v8H6z" />
      </svg>
      Cetak Laporan
    </Button>
  );
}
