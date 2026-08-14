import { describe, it, expect } from "vitest";
import { suggestNextInvoiceNumber, extractInvoiceYear, checkInvoiceNumberSequence } from "@/lib/invoiceNumbering";

describe("suggestNextInvoiceNumber", () => {
  it("continues the existing sequence for the given year", () => {
    const numbers = ["INV-2026-001", "INV-2026-002", "INV-2026-025", "INV-2026-010"];
    expect(suggestNextInvoiceNumber(numbers, 2026)).toBe("INV-2026-026");
  });

  it("preserves zero-padding width", () => {
    expect(suggestNextInvoiceNumber(["INV-2026-009"], 2026)).toBe("INV-2026-010");
    expect(suggestNextInvoiceNumber(["INV-2026-0099"], 2026)).toBe("INV-2026-0100");
  });

  it("returns null when nothing matches the current year", () => {
    expect(suggestNextInvoiceNumber(["INV-2025-001", "INV-2025-002"], 2026)).toBeNull();
  });

  it("returns null when there is no established pattern at all", () => {
    expect(suggestNextInvoiceNumber([], 2026)).toBeNull();
    expect(suggestNextInvoiceNumber(["A-100", "CUSTOM-INVOICE-1"], 2026)).toBeNull();
  });

  it("ignores non-matching formats mixed in with matching ones", () => {
    const numbers = ["INV-2026-003", "CUSTOM-1", "INV-2025-050"];
    expect(suggestNextInvoiceNumber(numbers, 2026)).toBe("INV-2026-004");
  });
});

describe("extractInvoiceYear", () => {
  it("extracts the year token from an INV-{year}-{seq} number", () => {
    expect(extractInvoiceYear("INV-2026-003")).toBe(2026);
  });

  it("returns null for anything that doesn't match the shape (manual override)", () => {
    expect(extractInvoiceYear("CUSTOM-SCHEME-1")).toBeNull();
    expect(extractInvoiceYear("INV-26-003")).toBeNull();
    expect(extractInvoiceYear("INV-2026-")).toBeNull();
    expect(extractInvoiceYear("")).toBeNull();
  });
});

describe("checkInvoiceNumberSequence", () => {
  it("returns null when the submitted number is exactly the expected next one", () => {
    const existing = ["INV-2026-001", "INV-2026-002"];
    expect(checkInvoiceNumberSequence("INV-2026-003", existing)).toBeNull();
  });

  it("returns a warning string when the number skips ahead of the expected sequence", () => {
    const existing = ["INV-2026-001", "INV-2026-002"];
    const warning = checkInvoiceNumberSequence("INV-2026-005", existing);
    expect(warning).not.toBeNull();
    expect(warning).toContain("INV-2026-003");
  });

  it("returns null (never blocks) for a manual-override format with no established year pattern", () => {
    expect(checkInvoiceNumberSequence("CUSTOM-SCHEME-1", ["INV-2026-001"])).toBeNull();
  });

  it("returns null when nothing exists yet for that year — no basis to claim a break", () => {
    expect(checkInvoiceNumberSequence("INV-2027-001", ["INV-2026-001"])).toBeNull();
  });

  it("never flags a duplicate of the last number as 'in sequence' by accident (still expects seq+1)", () => {
    // Resubmitting the same number as the last one isn't "next in sequence" —
    // this doesn't test DB uniqueness (a separate, pre-existing constraint),
    // just that the pure sequence check itself doesn't treat a repeat as OK.
    const existing = ["INV-2026-001", "INV-2026-002"];
    const warning = checkInvoiceNumberSequence("INV-2026-002", existing);
    expect(warning).not.toBeNull();
    expect(warning).toContain("INV-2026-003");
  });
});
