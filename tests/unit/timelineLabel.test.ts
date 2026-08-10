import { describe, it, expect } from "vitest";
import { describeTimelineEvent } from "@/lib/timelineLabel";

describe("describeTimelineEvent", () => {
  it("labels a fresh transaction as Created", () => {
    expect(describeTimelineEvent({ entityType: "FINANCIAL_TRANSACTION", action: "CREATE", newValue: {} })).toBe("Transaksi dicatat");
  });

  it("distinguishes Linked to Client vs Linked to Matter by newValue", () => {
    expect(describeTimelineEvent({ entityType: "FINANCIAL_TRANSACTION", action: "LINK", newValue: { clientId: "c1", matterId: null } })).toBe(
      "Linked to Client"
    );
    expect(describeTimelineEvent({ entityType: "FINANCIAL_TRANSACTION", action: "LINK", newValue: { clientId: "c1", matterId: "m1" } })).toBe(
      "Linked to Matter"
    );
  });

  it("labels classification creates per entity type", () => {
    expect(describeTimelineEvent({ entityType: "PAYMENT", action: "CREATE", newValue: {} })).toBe("Diklasifikasikan sebagai Payment");
    expect(describeTimelineEvent({ entityType: "DEPOSIT", action: "CREATE", newValue: {} })).toBe("Diklasifikasikan sebagai Deposit");
    expect(describeTimelineEvent({ entityType: "DISBURSEMENT", action: "CREATE", newValue: {} })).toBe("Diklasifikasikan sebagai Disbursement");
  });

  it("falls back to a generic label for unmapped combinations", () => {
    expect(describeTimelineEvent({ entityType: "INVOICE", action: "ATTACH", newValue: {} })).toBe("ATTACH — INVOICE");
  });
});
