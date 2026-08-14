// Excel/CSV Import (Workflow Refinement Step C) — deterministic, dependency
// -free parsing, column-mapping, and row validation. No AI, no fuzzy
// matching, no ownership inference (CLAUDE.md constraint 3): this file only
// maps spreadsheet COLUMNS to transaction FIELDS and checks each row is
// well-formed. It never guesses client/matter/classification.
//
// CSV-only, not .xlsx: the npm-published `xlsx` (SheetJS) package carries
// two unpatched high-severity advisories (prototype pollution, ReDoS) with
// no fix available on the registry. Decided against adding it — staff
// export/Save As CSV from Excel first. Revisit if a patched package
// becomes available or the risk profile is reassessed.

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
}

// Minimal RFC4180-ish parser: quoted fields, embedded commas, escaped ""
// quotes, \r\n / \n line endings. Not a complete CSV spec implementation —
// sufficient for a bank-rekap export, which is the actual target shape.
export function parseCsv(text: string): ParsedSheet {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  const [headers, ...body] = nonEmpty;
  return { headers: headers ?? [], rows: body };
}

export type CanonicalField = "transactionDate" | "description" | "amountIn" | "amountOut" | "amount";

// Deterministic exact-match alias table, case-insensitive — not semantic/
// fuzzy matching. Ambiguous or unrecognized headers simply don't get
// auto-mapped; the UI always shows the mapping for the user to confirm or
// correct (Step 5 §3: "Jika tidak jelas: minta user mapping").
const HEADER_ALIASES: Record<string, CanonicalField> = {
  tanggal: "transactionDate", tgl: "transactionDate", date: "transactionDate",
  keterangan: "description", deskripsi: "description", description: "description", uraian: "description",
  masuk: "amountIn", kredit: "amountIn", credit: "amountIn", in: "amountIn",
  keluar: "amountOut", debet: "amountOut", debit: "amountOut", out: "amountOut",
  jumlah: "amount", amount: "amount", nominal: "amount",
};

export function guessColumnMapping(headers: string[]): Partial<Record<CanonicalField, number>> {
  const mapping: Partial<Record<CanonicalField, number>> = {};
  headers.forEach((h, i) => {
    const field = HEADER_ALIASES[h.trim().toLowerCase()];
    if (field && mapping[field] === undefined) mapping[field] = i;
  });
  return mapping;
}

// DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD only — deliberately narrow rather
// than guessing ambiguous formats (e.g. 03/04/2026 could be either
// convention). Unrecognized formats are flagged for review, never guessed.
export function parseFlexibleDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (dmy) {
    const [, d, m, y] = dmy;
    const dd = d.padStart(2, "0");
    const mm = m.padStart(2, "0");
    if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) return `${y}-${mm}-${dd}`;
  }
  return null;
}

// Handles Indonesian-style thousand/decimal separators (Rp1.500.000 or
// Rp1.500.000,50) as well as plain "1500000" / "1500000.50". Heuristic but
// deterministic — never invents a value for unparseable input.
export function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.\-]/g, "");
  if (!cleaned) return null;
  let normalized: string;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/\.(?=\d{3}(\D|$))/g, "");
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export interface ValidatedRow {
  rowIndex: number; // 1-based, matches "Row 14" style messaging in the spec
  raw: string[];
  transactionDate: string | null;
  description: string;
  direction: "IN" | "OUT" | null;
  amount: number | null;
  status: "READY" | "NEEDS_REVIEW" | "INVALID";
  reasons: string[];
}

export function validateRows(rows: string[][], mapping: Partial<Record<CanonicalField, number>>): ValidatedRow[] {
  return rows.map((cells, i) => {
    const get = (field: CanonicalField) => (mapping[field] !== undefined ? cells[mapping[field]!]?.trim() : undefined);
    const dateRaw = get("transactionDate");
    const desc = get("description") ?? "";
    const amountInRaw = get("amountIn");
    const amountOutRaw = get("amountOut");
    const amountRaw = get("amount");

    const isEmpty = !dateRaw && !desc && !amountInRaw && !amountOutRaw && !amountRaw;
    if (isEmpty) {
      return { rowIndex: i + 1, raw: cells, transactionDate: null, description: "", direction: null, amount: null, status: "INVALID", reasons: ["Baris kosong"] };
    }

    const reasons: string[] = [];
    const parsedDate = parseFlexibleDate(dateRaw);
    if (!dateRaw) reasons.push("Tanggal kosong");
    else if (!parsedDate) reasons.push("Tanggal tidak dapat dibaca");

    if (!desc) reasons.push("Deskripsi kosong");

    let direction: "IN" | "OUT" | null = null;
    let amount: number | null = null;
    const inVal = parseAmount(amountInRaw);
    const outVal = parseAmount(amountOutRaw);
    const singleVal = parseAmount(amountRaw);
    if (inVal !== null && inVal > 0) {
      direction = "IN";
      amount = inVal;
    } else if (outVal !== null && outVal > 0) {
      direction = "OUT";
      amount = outVal;
    } else if (singleVal !== null && singleVal !== 0) {
      amount = Math.abs(singleVal);
      reasons.push("Arah transaksi (masuk/keluar) tidak dapat ditentukan");
    } else {
      reasons.push("Jumlah tidak valid atau kosong");
    }

    const hasBlockingIssue = !parsedDate || !desc || amount === null;
    const status: ValidatedRow["status"] = hasBlockingIssue ? "INVALID" : reasons.length > 0 ? "NEEDS_REVIEW" : "READY";

    return { rowIndex: i + 1, raw: cells, transactionDate: parsedDate, description: desc, direction, amount, status, reasons };
  });
}
