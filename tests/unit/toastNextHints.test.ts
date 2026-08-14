import { describe, it, expect } from "vitest";
import {
  transactionCreateNextHint,
  classifyNextHint,
  linkToClientOnlyNextHint,
  allocationNextHint,
} from "@/lib/toastNextHints";

describe("transactionCreateNextHint", () => {
  it("returns undefined when a client or matter was already selected at creation", () => {
    expect(transactionCreateNextHint(true)).toBeUndefined();
  });

  it("suggests linking when nothing was selected at creation", () => {
    expect(transactionCreateNextHint(false)).toEqual({
      text: "Link ke Client/Matter jika kepemilikannya sudah diketahui.",
    });
  });
});

describe("classifyNextHint", () => {
  it("suggests allocation only for PAYMENT", () => {
    expect(classifyNextHint("PAYMENT")).toEqual({
      text: "Alokasikan payment ini ke invoice jika sudah diketahui.",
    });
  });

  it("returns undefined for DEPOSIT", () => {
    expect(classifyNextHint("DEPOSIT")).toBeUndefined();
  });

  it("returns undefined for DISBURSEMENT", () => {
    expect(classifyNextHint("DISBURSEMENT")).toBeUndefined();
  });

  it("returns undefined for any other/unknown value", () => {
    expect(classifyNextHint("UNCLASSIFIED")).toBeUndefined();
    expect(classifyNextHint("")).toBeUndefined();
  });
});

describe("linkToClientOnlyNextHint", () => {
  it("returns undefined when the client has no matters", () => {
    expect(linkToClientOnlyNextHint(0)).toBeUndefined();
  });

  it("suggests linking to a matter when at least one exists", () => {
    expect(linkToClientOnlyNextHint(1)).toBe("Link ke Matter jika sudah diketahui.");
  });

  it("still suggests it when there are many matters", () => {
    expect(linkToClientOnlyNextHint(5)).toBe("Link ke Matter jika sudah diketahui.");
  });
});

describe("allocationNextHint", () => {
  it("always includes the invoice CTA", () => {
    const hint = allocationNextHint({
      invoiceNumber: "INV-2026-001",
      invoiceId: "invoice-1",
      paymentId: "payment-1",
      showPaymentDetailLink: false,
    });
    expect(hint.text).toBe("Payment berhasil dialokasikan ke invoice.");
    expect(hint.ctas).toEqual([{ label: "Lihat Invoice INV-2026-001", href: "/invoices/invoice-1" }]);
  });

  it("adds the payment CTA only when showPaymentDetailLink is true", () => {
    const hint = allocationNextHint({
      invoiceNumber: "INV-2026-002",
      invoiceId: "invoice-2",
      paymentId: "payment-2",
      showPaymentDetailLink: true,
    });
    expect(hint.ctas).toEqual([
      { label: "Lihat Invoice INV-2026-002", href: "/invoices/invoice-2" },
      { label: "Lihat Payment", href: "/payments/payment-2" },
    ]);
  });
});
