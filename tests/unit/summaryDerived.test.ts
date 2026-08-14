import { describe, it, expect } from "vitest";
import { computeAllocatedAmount } from "@/lib/summaryDerived";

describe("computeAllocatedAmount", () => {
  it("Total Invoice − Allocated reconciles to Outstanding", () => {
    const totalInvoice = 70_000_000;
    const outstanding = 30_000_000;
    const allocated = computeAllocatedAmount(totalInvoice, outstanding);
    expect(allocated).toBe(40_000_000);
    expect(totalInvoice - allocated).toBe(outstanding);
  });

  it("Total Payment − Allocated reconciles to Unallocated", () => {
    const totalPayment = 25_000_000;
    const unallocated = 5_000_000;
    const allocated = computeAllocatedAmount(totalPayment, unallocated);
    expect(allocated).toBe(20_000_000);
    expect(totalPayment - allocated).toBe(unallocated);
  });

  it("fully allocated (remaining = 0) returns the whole total", () => {
    expect(computeAllocatedAmount(100_000, 0)).toBe(100_000);
  });

  it("nothing allocated yet (remaining = total) returns 0", () => {
    expect(computeAllocatedAmount(50_000, 50_000)).toBe(0);
  });
});
