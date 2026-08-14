import { describe, it, expect } from "vitest";
import { suggestedActionForReason } from "@/lib/exceptionExplain";

describe("suggestedActionForReason", () => {
  it("returns null for no reason", () => {
    expect(suggestedActionForReason(null)).toBeNull();
  });

  it("suggests allocating remaining amount when partially unallocated", () => {
    expect(suggestedActionForReason("Sebagian payment belum dialokasikan.")).toContain("Alokasikan");
  });

  it("suggests reviewing allocation on overpayment (transaction-level)", () => {
    expect(suggestedActionForReason("Total alokasi melebihi jumlah payment.")).toContain("Tinjau alokasi");
  });

  it("suggests reviewing allocation on per-invoice overpayment", () => {
    expect(suggestedActionForReason("Overpayment pada invoice INV-2026-001.")).toContain("Tinjau alokasi");
  });

  it("suggests reviewing the invoice configuration on disallowed partial payment", () => {
    expect(suggestedActionForReason("Partial payment pada invoice INV-2026-001 yang tidak mengizinkan partial payment.")).toContain(
      "invoice perlu diperbarui"
    );
  });

  it("returns null for an unrecognized/manual reason rather than guessing", () => {
    expect(suggestedActionForReason("Dugaan duplikat, dicek manual oleh staf.")).toBeNull();
  });
});
