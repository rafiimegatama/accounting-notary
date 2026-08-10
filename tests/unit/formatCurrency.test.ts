import { describe, it, expect } from "vitest";
import { formatCurrency } from "@/lib/formatCurrency";

describe("formatCurrency", () => {
  it("formats a plain number as IDR", () => {
    expect(formatCurrency(1500000)).toContain("1.500.000");
  });

  it("formats a decimal string (as returned by Prisma.Decimal.toString())", () => {
    expect(formatCurrency("2500000.00")).toContain("2.500.000");
  });
});
