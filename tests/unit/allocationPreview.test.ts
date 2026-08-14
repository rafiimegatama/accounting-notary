import { describe, it, expect } from "vitest";
import { computeAllocationPreview } from "@/lib/allocationPreview";

describe("computeAllocationPreview", () => {
  it("normal allocation within both limits", () => {
    const preview = computeAllocationPreview(1_000_000, 800_000, 300_000);
    expect(preview.paymentRemaining).toBe(700_000);
    expect(preview.invoiceRemaining).toBe(500_000);
    expect(preview.exceedsPayment).toBe(false);
    expect(preview.exceedsInvoice).toBe(false);
    expect(preview.exceedsPaymentBy).toBe(0);
    expect(preview.exceedsInvoiceBy).toBe(0);
  });

  it("exact allocation (proposed === available payment)", () => {
    const preview = computeAllocationPreview(500_000, 900_000, 500_000);
    expect(preview.paymentRemaining).toBe(0);
    expect(preview.exceedsPayment).toBe(false);
    expect(preview.exceedsPaymentBy).toBe(0);
  });

  it("payment over-allocation (proposed > available payment)", () => {
    const preview = computeAllocationPreview(500_000, 2_000_000, 700_000);
    expect(preview.exceedsPayment).toBe(true);
    expect(preview.exceedsPaymentBy).toBe(200_000);
    expect(preview.paymentRemaining).toBe(-200_000);
    // Invoice has plenty of room — should not be flagged.
    expect(preview.exceedsInvoice).toBe(false);
    expect(preview.exceedsInvoiceBy).toBe(0);
  });

  it("invoice over-allocation (proposed > invoice outstanding)", () => {
    const preview = computeAllocationPreview(2_000_000, 400_000, 600_000);
    expect(preview.exceedsInvoice).toBe(true);
    expect(preview.exceedsInvoiceBy).toBe(200_000);
    expect(preview.invoiceRemaining).toBe(-200_000);
    expect(preview.exceedsPayment).toBe(false);
  });

  it("both payment and invoice exceeded at once", () => {
    const preview = computeAllocationPreview(300_000, 250_000, 500_000);
    expect(preview.exceedsPayment).toBe(true);
    expect(preview.exceedsPaymentBy).toBe(200_000);
    expect(preview.exceedsInvoice).toBe(true);
    expect(preview.exceedsInvoiceBy).toBe(250_000);
    expect(preview.paymentRemaining).toBe(-200_000);
    expect(preview.invoiceRemaining).toBe(-250_000);
  });

  it("treats a non-finite proposed amount as 0 rather than propagating NaN", () => {
    const preview = computeAllocationPreview(500_000, 500_000, NaN);
    expect(preview.proposedAmount).toBe(0);
    expect(preview.paymentRemaining).toBe(500_000);
    expect(preview.invoiceRemaining).toBe(500_000);
    expect(preview.exceedsPayment).toBe(false);
    expect(preview.exceedsInvoice).toBe(false);
  });
});
