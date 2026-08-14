// Suggests the next invoice number for the current year by continuing
// whatever INV-{year}-{seq} pattern is already established in the data —
// never invents a scheme. Returns null when no invoice for that year
// matches the pattern, so the field falls back to its previous blank/free
// text behavior rather than guessing a format for a brand-new office.
export function suggestNextInvoiceNumber(existingNumbers: string[], year: number): string | null {
  const pattern = new RegExp(`^INV-${year}-(\\d+)$`);
  let maxSeq = 0;
  let width = 3;

  for (const num of existingNumbers) {
    const match = num.match(pattern);
    if (!match) continue;
    const seq = parseInt(match[1], 10);
    if (seq > maxSeq) {
      maxSeq = seq;
      width = match[1].length;
    }
  }

  if (maxSeq === 0) return null;
  return `INV-${year}-${String(maxSeq + 1).padStart(width, "0")}`;
}

// Full INV-{4 digit year}-{seq} shape — the format confirmed against real
// seeded data (scripts/seed-demo.ts) and already relied on by
// suggestNextInvoiceNumber above. Kept as one shared pattern so route.ts
// and this module can't drift out of sync on what "the format" is.
const INVOICE_NUMBER_PATTERN = /^INV-(\d{4})-(\d+)$/;

// Extracts the year token from an INV-{year}-{seq} formatted number, or
// null when the number doesn't follow that shape at all (a manual
// override / legacy scheme — ROADMAP.md #1 explicitly keeps this allowed:
// "some numbering schemes have exceptions"). Callers use this to decide
// whether a sequence check is even possible before touching the database.
export function extractInvoiceYear(invoiceNumber: string): number | null {
  const match = INVOICE_NUMBER_PATTERN.exec(invoiceNumber);
  return match ? Number(match[1]) : null;
}

// Roadmap #1, acceptance criterion 2: "the system warns if the entered
// number breaks sequence" — but per CLAUDE.md §7 point 7 this must never
// block. Returns a human-readable warning string, or null whenever no
// confident claim can be made: the number doesn't match the INV-{year}-{seq}
// shape at all (an intentional override, not a "broken" one), there's no
// established pattern yet for that year (nothing to compare against), or
// the number already *is* the expected next one. `existingNumbers` must be
// the invoice numbers that existed *before* this one was submitted.
export function checkInvoiceNumberSequence(invoiceNumber: string, existingNumbers: string[]): string | null {
  const year = extractInvoiceYear(invoiceNumber);
  if (year === null) return null;

  const expected = suggestNextInvoiceNumber(existingNumbers, year);
  if (!expected || expected === invoiceNumber) return null;

  return `Nomor invoice tidak berurutan. Nomor berikutnya yang diharapkan untuk tahun ${year} adalah ${expected}.`;
}
