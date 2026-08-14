import { describe, it, expect } from "vitest";
import { parseCsv, guessColumnMapping, parseFlexibleDate, parseAmount, validateRows } from "@/lib/excelImport";

describe("parseCsv", () => {
  it("parses a simple comma-separated sheet with headers", () => {
    const { headers, rows } = parseCsv("Tanggal,Keterangan,Masuk,Keluar\n01/08/2026,Transfer A,500000,\n02/08/2026,Transfer B,,200000\n");
    expect(headers).toEqual(["Tanggal", "Keterangan", "Masuk", "Keluar"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["01/08/2026", "Transfer A", "500000", ""]);
  });

  it("handles quoted fields with embedded commas", () => {
    const { rows } = parseCsv('Tanggal,Keterangan,Masuk\n01/08/2026,"Transfer, an, example",500000\n');
    expect(rows[0][1]).toBe("Transfer, an, example");
  });

  it("skips fully blank lines", () => {
    const { rows } = parseCsv("Tanggal,Keterangan,Masuk\n01/08/2026,A,100\n\n\n02/08/2026,B,200\n");
    expect(rows).toHaveLength(2);
  });
});

describe("guessColumnMapping", () => {
  it("maps known Indonesian bank-rekap headers", () => {
    const mapping = guessColumnMapping(["Tanggal", "Keterangan", "Masuk", "Keluar"]);
    expect(mapping).toEqual({ transactionDate: 0, description: 1, amountIn: 2, amountOut: 3 });
  });

  it("is case-insensitive and ignores unrecognized headers rather than guessing", () => {
    const mapping = guessColumnMapping(["TANGGAL", "Saldo Berjalan", "Keterangan"]);
    expect(mapping.transactionDate).toBe(0);
    expect(mapping.description).toBe(2);
    expect(Object.keys(mapping)).not.toContain("saldo");
  });
});

describe("parseFlexibleDate", () => {
  it("accepts DD/MM/YYYY", () => expect(parseFlexibleDate("05/08/2026")).toBe("2026-08-05"));
  it("accepts DD-MM-YYYY", () => expect(parseFlexibleDate("5-8-2026")).toBe("2026-08-05"));
  it("accepts ISO YYYY-MM-DD", () => expect(parseFlexibleDate("2026-08-05")).toBe("2026-08-05"));
  it("rejects an invalid month", () => expect(parseFlexibleDate("05/13/2026")).toBeNull());
  it("rejects unparseable text", () => expect(parseFlexibleDate("kemarin")).toBeNull());
});

describe("parseAmount", () => {
  it("parses a plain integer", () => expect(parseAmount("500000")).toBe(500000));
  it("parses Indonesian thousand separators", () => expect(parseAmount("Rp1.500.000")).toBe(1500000));
  it("parses Indonesian decimal comma", () => expect(parseAmount("1.500.000,50")).toBe(1500000.5));
  it("returns null for empty/unparseable input", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });
});

describe("validateRows — Step 21 scenarios", () => {
  const mapping = { transactionDate: 0, description: 1, amountIn: 2, amountOut: 3 } as const;

  it("Scenario 1: 10 well-formed rows are all READY", () => {
    const rows = Array.from({ length: 10 }, (_, i) => [`0${(i % 9) + 1}/08/2026`, `Transfer ${i}`, "500000", ""]);
    const result = validateRows(rows, mapping);
    expect(result.every((r) => r.status === "READY")).toBe(true);
    expect(result).toHaveLength(10);
  });

  it("Scenario 2: invalid date -> INVALID with a specific reason", () => {
    const [row] = validateRows([["31/13/2026", "Transfer", "100000", ""]], mapping);
    expect(row.status).toBe("INVALID");
    expect(row.reasons).toContain("Tanggal tidak dapat dibaca");
  });

  it("Scenario 3: invalid/unparseable amount -> INVALID", () => {
    const [row] = validateRows([["01/08/2026", "Transfer", "abc", ""]], mapping);
    expect(row.status).toBe("INVALID");
    expect(row.reasons).toContain("Jumlah tidak valid atau kosong");
  });

  it("Scenario 4: missing description -> INVALID (never silently skipped)", () => {
    const [row] = validateRows([["01/08/2026", "", "100000", ""]], mapping);
    expect(row.status).toBe("INVALID");
    expect(row.reasons).toContain("Deskripsi kosong");
  });

  it("Scenario 5: empty row -> INVALID, not silently dropped from the result set", () => {
    const rows = [["01/08/2026", "A", "100000", ""], ["", "", "", ""], ["02/08/2026", "B", "", "50000"]];
    const result = validateRows(rows, mapping);
    expect(result).toHaveLength(3);
    expect(result[1].status).toBe("INVALID");
    expect(result[1].reasons).toEqual(["Baris kosong"]);
  });

  it("Scenario 6: mixed IN/OUT rows resolve direction correctly", () => {
    const rows = [["01/08/2026", "Masuk", "500000", ""], ["02/08/2026", "Keluar", "", "300000"]];
    const result = validateRows(rows, mapping);
    expect(result[0].direction).toBe("IN");
    expect(result[0].amount).toBe(500000);
    expect(result[1].direction).toBe("OUT");
    expect(result[1].amount).toBe(300000);
  });

  it("a single unlabeled amount column without direction is NEEDS_REVIEW, not guessed", () => {
    const singleMapping = { transactionDate: 0, description: 1, amount: 2 } as const;
    const [row] = validateRows([["01/08/2026", "Transfer", "100000"]], singleMapping);
    expect(row.status).toBe("NEEDS_REVIEW");
    expect(row.reasons).toContain("Arah transaksi (masuk/keluar) tidak dapat ditentukan");
  });
});
