import { describe, it, expect } from "vitest";
import { call } from "../helpers/callApi";

import { POST as createClient } from "@/app/api/clients/route";
import { POST as createMatter } from "@/app/api/matters/route";
import { GET as getTransactions, POST as createTransaction } from "@/app/api/transactions/route";
import { POST as linkTransaction } from "@/app/api/transactions/[id]/link/route";
import { POST as classifyTransaction } from "@/app/api/transactions/[id]/classify/route";
import { POST as voidTransaction } from "@/app/api/transactions/[id]/void/route";
import { POST as createInvoice } from "@/app/api/invoices/route";
import { POST as allocatePayment } from "@/app/api/payments/[id]/allocate/route";
import { POST as correctPayment } from "@/app/api/payments/[id]/correct/route";
import { GET as getTrace } from "@/app/api/trace/[entryId]/route";
import { GET as search } from "@/app/api/search/route";
import { POST as attachFile } from "@/app/api/attachments/route";
import { GET as downloadAttachment } from "@/app/api/attachments/[id]/route";
import { COOKIE_NAME, createSessionCookieValue } from "@/lib/session";
import { GET as getMatterPosition } from "@/app/api/matters/[id]/position/route";
import { GET as getClientPosition } from "@/app/api/clients/[id]/position/route";

// Each scenario below is numbered exactly as in Step 20 of the master
// prompt, testing the actual route handlers (not a reimplementation) end
// to end against a real, freshly-reset PostgreSQL database (see
// scripts/reset-test-db.sh — row-level cleanup between runs isn't possible
// by design, since DELETE is trigger-blocked on every financial table).

async function makeClient(name: string) {
  const { json } = await call(createClient, { method: "POST", body: { name } });
  return json.data;
}
async function makeMatter(clientId: string, matterName: string) {
  const { json } = await call(createMatter, { method: "POST", body: { clientId, matterName } });
  return json.data;
}

describe("Scenario 1 — payment masuk, client belum diketahui", () => {
  it("transaction tetap UNLINKED, tidak ada forced assignment", async () => {
    const { status, json } = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-08-01", amount: 5000000, direction: "IN", description: "Transfer masuk belum jelas" },
    });
    expect(status).toBe(201);
    expect(json.data.clientId).toBeNull();
    expect(json.data.matterId).toBeNull();

    const list = await call(getTransactions, { query: { unlinked: "true" } });
    expect(list.json.data.some((t: { id: string }) => t.id === json.data.id)).toBe(true);
  });
});

describe("Scenario 2 — client kemudian diketahui", () => {
  it("transaction dapat di-link ke Client", async () => {
    const client = await makeClient("Scenario2 Client");
    const txn = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-08-01", amount: 1000000, direction: "IN", description: "Scenario 2 txn" },
    });

    const linked = await call(linkTransaction, {
      method: "POST",
      body: { action: "LINK_CLIENT", clientId: client.id },
      params: { id: txn.json.data.id },
    });
    expect(linked.status).toBe(200);
    expect(linked.json.data.clientId).toBe(client.id);
    expect(linked.json.data.matterId).toBeNull();
  });
});

describe("Scenario 3 — matter diketahui", () => {
  it("transaction dapat di-link ke Matter, client ikut ter-derive", async () => {
    const client = await makeClient("Scenario3 Client");
    const matter = await makeMatter(client.id, "Scenario3 Matter");
    const txn = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-08-01", amount: 1000000, direction: "IN", description: "Scenario 3 txn" },
    });

    const linked = await call(linkTransaction, {
      method: "POST",
      body: { action: "LINK_MATTER", matterId: matter.id },
      params: { id: txn.json.data.id },
    });
    expect(linked.json.data.matterId).toBe(matter.id);
    expect(linked.json.data.clientId).toBe(client.id);
  });
});

describe("Scenario 4 — client dengan beberapa matter", () => {
  it("financial position dapat dipisahkan per matter", async () => {
    const client = await makeClient("Scenario4 Client");
    const matterA = await makeMatter(client.id, "Scenario4 Matter A");
    const matterB = await makeMatter(client.id, "Scenario4 Matter B");

    const { POST: createCostDetail } = await import("@/app/api/cost-details/route");
    await call(createCostDetail, { method: "POST", body: { matterId: matterA.id, costDate: "2026-08-01", description: "Biaya A", amount: 3000000 } });
    await call(createCostDetail, { method: "POST", body: { matterId: matterB.id, costDate: "2026-08-01", description: "Biaya B", amount: 7000000 } });

    const posA = await call(getMatterPosition, { params: { id: matterA.id } });
    const posB = await call(getMatterPosition, { params: { id: matterB.id } });
    expect(posA.json.data.summary.totalCost).toBe("3000000");
    expect(posB.json.data.summary.totalCost).toBe("7000000");

    const clientPos = await call(getClientPosition, { params: { id: client.id } });
    expect(clientPos.json.data.summary.totalCost).toBe("10000000");
    expect(clientPos.json.data.matterBreakdown).toHaveLength(2);
  });
});

describe("Scenario 5 — client dengan banyak financial transaction", () => {
  it("consolidated client view tersedia", async () => {
    const client = await makeClient("Scenario5 Client");
    const matter = await makeMatter(client.id, "Scenario5 Matter");

    for (const amount of [1000000, 2000000, 3000000]) {
      const txn = await call(createTransaction, {
        method: "POST",
        body: { transactionDate: "2026-08-01", amount, direction: "IN", matterId: matter.id, description: "Scenario 5 txn" },
      });
      await call(classifyTransaction, { method: "POST", body: { financialType: "DEPOSIT" }, params: { id: txn.json.data.id } });
    }

    const clientPos = await call(getClientPosition, { params: { id: client.id } });
    expect(clientPos.json.data.summary.depositReceived).toBe("6000000");
  });
});

describe("Scenario 6 — matter dengan banyak cost detail", () => {
  it("semua cost dapat dilihat dari satu screen (Matter Position)", async () => {
    const client = await makeClient("Scenario6 Client");
    const matter = await makeMatter(client.id, "Scenario6 Matter");
    const { POST: createCostDetail } = await import("@/app/api/cost-details/route");
    for (const desc of ["Biaya 1", "Biaya 2", "Biaya 3"]) {
      await call(createCostDetail, { method: "POST", body: { matterId: matter.id, costDate: "2026-08-01", description: desc, amount: 500000 } });
    }
    const pos = await call(getMatterPosition, { params: { id: matter.id } });
    expect(pos.json.data.detail.costDetails).toHaveLength(3);
  });
});

async function setupPaymentAgainstInvoice(opts: { allowPartialPayment: boolean; invoiceAmount: number; paymentAmount: number }) {
  const client = await makeClient(`Scenario7-8 Client ${Date.now()}-${Math.random()}`);
  const matter = await makeMatter(client.id, "Invoice Matter");
  const invoice = await call(createInvoice, {
    method: "POST",
    body: {
      matterId: matter.id,
      invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      invoiceDate: "2026-08-01",
      totalAmount: opts.invoiceAmount,
      allowPartialPayment: opts.allowPartialPayment,
    },
  });
  const txn = await call(createTransaction, {
    method: "POST",
    body: { transactionDate: "2026-08-01", amount: opts.paymentAmount, direction: "IN", matterId: matter.id, description: "Payment" },
  });
  const payment = await call(classifyTransaction, { method: "POST", body: { financialType: "PAYMENT" }, params: { id: txn.json.data.id } });
  const allocation = await call(allocatePayment, {
    method: "POST",
    body: { invoiceId: invoice.json.data.id, allocationType: "INVOICE_PAYMENT", amount: opts.paymentAmount },
    params: { id: payment.json.data.id },
  });
  return { client, matter, invoice: invoice.json.data, transactionId: txn.json.data.id, allocation };
}

describe("Scenario 7 — partial payment sesuai struktur invoice", () => {
  it("hasil: NORMAL / PARTIALLY_PAID, bukan REVIEW_REQUIRED", async () => {
    const { matter, invoice } = await setupPaymentAgainstInvoice({ allowPartialPayment: true, invoiceAmount: 20000000, paymentAmount: 10000000 });
    const pos = await call(getMatterPosition, { params: { id: matter.id } });
    const invoiceRow = pos.json.data.detail.invoices.find((i: { invoiceId: string }) => i.invoiceId === invoice.id);
    expect(invoiceRow.paymentStatus).toBe("PARTIALLY_PAID");

    const payments = pos.json.data.detail.payments as { reviewStatus: string }[];
    expect(payments.every((p) => p.reviewStatus === "NORMAL")).toBe(true);
  });
});

describe("Scenario 8 — payment tidak sesuai expected invoice", () => {
  it("hasil: REVIEW_REQUIRED", async () => {
    const { matter } = await setupPaymentAgainstInvoice({ allowPartialPayment: false, invoiceAmount: 20000000, paymentAmount: 10000000 });
    const pos = await call(getMatterPosition, { params: { id: matter.id } });
    const payments = pos.json.data.detail.payments as { reviewStatus: string }[];
    expect(payments.some((p) => p.reviewStatus === "REVIEW_REQUIRED")).toBe(true);
  });

  it("perubahan status otomatis ini tetap tercatat di audit trail (Step 22 fix)", async () => {
    const { transactionId } = await setupPaymentAgainstInvoice({ allowPartialPayment: false, invoiceAmount: 20000000, paymentAmount: 10000000 });
    const trace = await call(getTrace, { params: { entryId: transactionId }, query: { entryType: "TRANSACTION" } });
    const timeline = trace.json.data[0].timeline as { action: string; newValue: { reviewStatus?: string } }[];
    const statusChange = timeline.find((t) => t.action === "STATUS_CHANGE" && t.newValue?.reviewStatus === "REVIEW_REQUIRED");
    expect(statusChange).toBeDefined();
  });
});

describe("Scenario 9 — satu payment dialokasikan ke beberapa invoice", () => {
  it("allocation dapat ditelusuri lewat trace", async () => {
    const client = await makeClient("Scenario9 Client");
    const matter = await makeMatter(client.id, "Scenario9 Matter");
    const invA = await call(createInvoice, {
      method: "POST",
      body: { matterId: matter.id, invoiceNumber: `INV-A-${Date.now()}`, invoiceDate: "2026-08-01", totalAmount: 5000000, allowPartialPayment: true },
    });
    const invB = await call(createInvoice, {
      method: "POST",
      body: { matterId: matter.id, invoiceNumber: `INV-B-${Date.now()}`, invoiceDate: "2026-08-01", totalAmount: 5000000, allowPartialPayment: true },
    });
    const txn = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-08-01", amount: 10000000, direction: "IN", matterId: matter.id, description: "Multi-invoice payment" },
    });
    const payment = await call(classifyTransaction, { method: "POST", body: { financialType: "PAYMENT" }, params: { id: txn.json.data.id } });
    await call(allocatePayment, {
      method: "POST",
      body: { invoiceId: invA.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 5000000 },
      params: { id: payment.json.data.id },
    });
    await call(allocatePayment, {
      method: "POST",
      body: { invoiceId: invB.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 5000000 },
      params: { id: payment.json.data.id },
    });

    const trace = await call(getTrace, { params: { entryId: txn.json.data.id }, query: { entryType: "TRANSACTION" } });
    const allocations = trace.json.data[0].nodes.allocations;
    expect(allocations).toHaveLength(2);
    expect(trace.json.data[0].currentStatus.reviewStatus).toBe("NORMAL"); // fully allocated
  });
});

describe("Section 36 checklist #12 — overpayment triggers REVIEW_REQUIRED", () => {
  it("allocating more than an invoice's total_amount flags the transaction, never blocks the allocation", async () => {
    const client = await makeClient("Overpayment Client");
    const matter = await makeMatter(client.id, "Overpayment Matter");
    const invoice = await call(createInvoice, {
      method: "POST",
      body: { matterId: matter.id, invoiceNumber: `INV-OVERPAY-${Date.now()}`, invoiceDate: "2026-08-01", totalAmount: 5000000, allowPartialPayment: true },
    });
    const txn = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-08-01", amount: 8000000, direction: "IN", matterId: matter.id, description: "Overpayment scenario" },
    });
    const payment = await call(classifyTransaction, { method: "POST", body: { financialType: "PAYMENT" }, params: { id: txn.json.data.id } });

    const allocation = await call(allocatePayment, {
      method: "POST",
      body: { invoiceId: invoice.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 8000000 },
      params: { id: payment.json.data.id },
    });
    // Never blocked — the allocation itself succeeds (Principle 3: advisory only).
    expect(allocation.status).toBe(201);

    const trace = await call(getTrace, { params: { entryId: txn.json.data.id }, query: { entryType: "TRANSACTION" } });
    expect(trace.json.data[0].currentStatus.reviewStatus).toBe("REVIEW_REQUIRED");
  });
});

describe("Section 36 checklist #14 — disbursement", () => {
  it("classifying an OUT transaction as DISBURSEMENT reflects in Matter Position", async () => {
    const client = await makeClient("Disbursement Client");
    const matter = await makeMatter(client.id, "Disbursement Matter");
    const txn = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-08-01", amount: 4500000, direction: "OUT", matterId: matter.id, description: "Pembayaran BPHTB" },
    });
    const disbursement = await call(classifyTransaction, {
      method: "POST",
      body: { financialType: "DISBURSEMENT", category: "BPHTB" },
      params: { id: txn.json.data.id },
    });
    expect(disbursement.status).toBe(201);

    const pos = await call(getMatterPosition, { params: { id: matter.id } });
    expect(pos.json.data.summary.disbursementTotal).toBe("4500000");
    expect(pos.json.data.detail.disbursements.some((d: { transactionId: string }) => d.transactionId === txn.json.data.id)).toBe(true);
  });
});

describe("Scenario 10 — mencari transaksi lama", () => {
  it("Search → Transaction → Timeline", async () => {
    const uniqueDescription = `Pelunasan Akta Rumah Scenario10 ${Date.now()}`;
    const txn = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-01-15", amount: 15000000, direction: "IN", description: uniqueDescription },
    });

    const results = await call(search, { query: { q: uniqueDescription } });
    expect(results.json.data.transactions.some((t: { id: string }) => t.id === txn.json.data.id)).toBe(true);

    const trace = await call(getTrace, { params: { entryId: txn.json.data.id }, query: { entryType: "TRANSACTION" } });
    expect(trace.json.data[0].timeline.length).toBeGreaterThan(0);
    expect(trace.json.data[0].timeline[0].action).toBe("CREATE");
  });
});

describe("Scenario 11 — posisi financial Matter", () => {
  it("tersedia dalam satu screen (satu API call)", async () => {
    const client = await makeClient("Scenario11 Client");
    const matter = await makeMatter(client.id, "Scenario11 Matter");
    const pos = await call(getMatterPosition, { params: { id: matter.id } });
    expect(pos.status).toBe(200);
    expect(pos.json.data.summary).toBeDefined();
    expect(pos.json.data.detail).toBeDefined();
  });
});

describe("Scenario 12 — sumber informasi", () => {
  it("source dan attachment tersedia dan tertelusur", async () => {
    const txn = await call(createTransaction, {
      method: "POST",
      body: {
        transactionDate: "2026-08-01",
        amount: 2000000,
        direction: "IN",
        description: "Scenario 12 txn",
        sourceType: "WHATSAPP",
        sourceReference: "Chat 5 Agustus dengan Bu Rina",
      },
    });

    const form = new FormData();
    form.set("file", new File(["dummy content"], "bukti-transfer.jpg", { type: "image/jpeg" }));
    form.set("transactionId", txn.json.data.id);
    const attached = await call(attachFile, { method: "POST", formData: form });
    expect(attached.status).toBe(201);

    const trace = await call(getTrace, { params: { entryId: txn.json.data.id }, query: { entryType: "TRANSACTION" } });
    expect(trace.json.data[0].nodes.source.sourceType).toBe("WHATSAPP");
    expect(trace.json.data[0].nodes.source.sourceReference).toBe("Chat 5 Agustus dengan Bu Rina");
    expect(trace.json.data[0].nodes.source.attachments).toHaveLength(1);

    // P2 evidence visibility: the attachment shown in the trace must
    // actually be retrievable, not just named — call() can't be reused
    // here since it always parses the response as JSON, but a download is
    // a binary/file response.
    const attachmentId = attached.json.data.id;
    const cookie = `${COOKIE_NAME}=${createSessionCookieValue("00000000-0000-0000-0000-000000000001", "Test Staff")}`;
    const downloadRes = await downloadAttachment(
      new Request("http://localhost/api/test", { headers: { cookie } }),
      { params: { id: attachmentId } }
    );
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("Content-Disposition")).toContain("bukti-transfer.jpg");
    expect(await downloadRes.text()).toBe("dummy content");

    const unauthedRes = await downloadAttachment(new Request("http://localhost/api/test"), { params: { id: attachmentId } });
    expect(unauthedRes.status).toBe(401);

    const missingRes = await downloadAttachment(
      new Request("http://localhost/api/test", { headers: { cookie } }),
      { params: { id: "00000000-0000-0000-0000-000000000099" } }
    );
    expect(missingRes.status).toBe(404);
  });
});

describe("Scenario 13 — transaction di-link lalu dikoreksi (relink)", () => {
  it("previous state tetap terlihat di audit trail", async () => {
    const client = await makeClient("Scenario13 Client");
    const matterA = await makeMatter(client.id, "Scenario13 Matter A");
    const matterB = await makeMatter(client.id, "Scenario13 Matter B");
    const txn = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-08-01", amount: 1000000, direction: "IN", description: "Scenario 13 txn" },
    });

    await call(linkTransaction, { method: "POST", body: { action: "LINK_MATTER", matterId: matterA.id }, params: { id: txn.json.data.id } });
    await call(linkTransaction, {
      method: "POST",
      body: { action: "LINK_MATTER", matterId: matterB.id, reason: "Salah pilih matter awal" },
      params: { id: txn.json.data.id },
    });

    const trace = await call(getTrace, { params: { entryId: txn.json.data.id }, query: { entryType: "TRANSACTION" } });
    const timeline = trace.json.data[0].timeline as { action: string; previousValue: { matterId: string | null } }[];

    expect(timeline.some((t) => t.action === "LINK")).toBe(true);
    const relinkEvent = timeline.find((t) => t.action === "RELINK");
    expect(relinkEvent).toBeDefined();
    expect(relinkEvent!.previousValue.matterId).toBe(matterA.id); // previous state preserved
    expect(trace.json.data[0].nodes.matter.id).toBe(matterB.id); // current state is the correction
  });
});

describe("Scenario 14 — user tidak mengetahui client/matter", () => {
  it("transaction dapat tetap UNLINKED tanpa error", async () => {
    const { status, json } = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-08-01", amount: 750000, direction: "OUT", description: "Belum jelas untuk apa" },
    });
    expect(status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.clientId).toBeNull();
    expect(json.data.matterId).toBeNull();
  });
});

describe("P2.3 — Matter source aggregation", () => {
  it("mengumpulkan attachment dari cost detail dan transaction, dengan context yang benar, tanpa duplikat", async () => {
    const { getMatterSourceSummary } = await import("@/lib/sources");
    const { POST: createCostDetail } = await import("@/app/api/cost-details/route");

    const client = await makeClient("P2.3 Client");
    const matter = await makeMatter(client.id, "P2.3 Matter");

    const costDetail = await call(createCostDetail, {
      method: "POST",
      body: { matterId: matter.id, costDate: "2026-08-01", description: "Biaya P2.3", category: "BPHTB", amount: 25000000 },
    });
    const costForm = new FormData();
    costForm.set("file", new File(["cost doc"], "dokumen.pdf", { type: "application/pdf" }));
    costForm.set("costDetailId", costDetail.json.data.id);
    await call(attachFile, { method: "POST", formData: costForm });

    const txn = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-07-25", amount: 2000000, direction: "IN", matterId: matter.id, description: "P2.3 txn" },
    });
    const txnForm = new FormData();
    txnForm.set("file", new File(["proof"], "bukti-transfer.pdf", { type: "application/pdf" }));
    txnForm.set("transactionId", txn.json.data.id);
    await call(attachFile, { method: "POST", formData: txnForm });

    const summary = await getMatterSourceSummary(matter.id);
    expect(summary).toHaveLength(2);

    const costItem = summary.find((s) => s.fileName === "dokumen.pdf");
    expect(costItem?.origin).toBe("COST_DETAIL");
    expect(costItem?.originLabel).toContain("BPHTB");
    expect(costItem?.originHref).toBeNull();

    const txnItem = summary.find((s) => s.fileName === "bukti-transfer.pdf");
    expect(txnItem?.origin).toBe("TRANSACTION");
    expect(txnItem?.originHref).toBe(`/transactions/${txn.json.data.id}`);

    // No duplicates — each attachment appears exactly once even though it's
    // reachable via both its own FK and (indirectly) the matter.
    const ids = summary.map((s) => s.attachmentId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Phase 2 refinement — Dashboard Unallocated Payments count", () => {
  it("mencerminkan payment yang belum sepenuhnya teralokasi", async () => {
    const { getDashboardSummaryCards } = await import("@/lib/dashboard");

    const before = await getDashboardSummaryCards();

    const client = await makeClient("PhaseRefinement Client");
    const matter = await makeMatter(client.id, "PhaseRefinement Matter");
    const invoice = await call(createInvoice, {
      method: "POST",
      body: { matterId: matter.id, invoiceNumber: `INV-REFINE-${Date.now()}`, invoiceDate: "2026-08-01", totalAmount: 10000000, allowPartialPayment: true },
    });

    const txn = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-08-01", amount: 10000000, direction: "IN", matterId: matter.id, description: "Phase refinement payment" },
    });
    await call(classifyTransaction, { method: "POST", body: { financialType: "PAYMENT" }, params: { id: txn.json.data.id } });
    // Only partially allocate — 4jt of 10jt payment — so it counts as unallocated.
    await call(allocatePayment, {
      method: "POST",
      body: { invoiceId: invoice.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 4000000 },
      params: { id: txn.json.data.id },
    });

    const after = await getDashboardSummaryCards();
    expect(after.unallocatedPaymentCount).toBe(before.unallocatedPaymentCount + 1);
  });
});

describe("Dashboard chart refinement — Unlinked Transactions by Age", () => {
  it("buckets unlinked transactions by current age (un-windowed snapshot), consistent with the summary card count", async () => {
    const { getUnlinkedBacklogAging, getDashboardSummaryCards } = await import("@/lib/dashboard");

    const before = await getUnlinkedBacklogAging();
    const beforeBucket = (key: string) => before.find((b) => b.key === key)!.count;

    // 40 days ago lands deterministically in the "31-60 Hari" bucket
    // regardless of when this test runs — this replaces the old chart's
    // date-windowed trend (which bucketed by transaction date, not current
    // age) with a true, un-windowed aging snapshot.
    const fortyDaysAgo = new Date();
    fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);
    const transactionDate = fortyDaysAgo.toISOString().slice(0, 10);

    await call(createTransaction, {
      method: "POST",
      body: { transactionDate, amount: 750000, direction: "IN", description: "Unlinked aging snapshot test txn" },
    });

    const after = await getUnlinkedBacklogAging();
    const afterBucket = (key: string) => after.find((b) => b.key === key)!.count;

    expect(afterBucket("31-60")).toBe(beforeBucket("31-60") + 1);
    expect(afterBucket("0-7")).toBe(beforeBucket("0-7"));
    expect(afterBucket("8-30")).toBe(beforeBucket("8-30"));
    expect(afterBucket("60plus")).toBe(beforeBucket("60plus"));

    // Cross-widget consistency: sum of every bucket must equal the same
    // "unlinked" count shown elsewhere on the Dashboard (Needs Attention,
    // hero shortcut, KPI card) — both read the identical filter
    // (status: ACTIVE, clientId: null, matterId: null), one buckets by age
    // and the other doesn't.
    const summary = await getDashboardSummaryCards();
    const totalBucketed = after.reduce((a, b) => a + b.count, 0);
    expect(totalBucketed).toBe(summary.unlinked);
  });
});

describe("Phase 2 refinement — partial link is a distinct, valid state", () => {
  it("client known, matter unknown tetap valid dan tidak dipaksa lengkap", async () => {
    const client = await makeClient("PartialLink Client");
    const txn = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-08-01", amount: 1500000, direction: "IN", description: "Partial link txn" },
    });
    const linked = await call(linkTransaction, {
      method: "POST",
      body: { action: "LINK_CLIENT", clientId: client.id },
      params: { id: txn.json.data.id },
    });
    expect(linked.json.data.clientId).toBe(client.id);
    expect(linked.json.data.matterId).toBeNull();

    const trace = await call(getTrace, { params: { entryId: txn.json.data.id }, query: { entryType: "TRANSACTION" } });
    expect(trace.json.data[0].nodes.client.id).toBe(client.id);
    expect(trace.json.data[0].nodes.matter).toBeNull();
  });
});

describe("P2.4 — Client source aggregation", () => {
  it("count mencakup seluruh matter di bawah client, recent list ter-cap dan tidak ada duplikat", async () => {
    const { getClientSourceSummary } = await import("@/lib/sources");
    const { POST: createCostDetail } = await import("@/app/api/cost-details/route");

    const client = await makeClient("P2.4 Client");
    const matter = await makeMatter(client.id, "P2.4 Matter");

    const costDetail = await call(createCostDetail, {
      method: "POST",
      body: { matterId: matter.id, costDate: "2026-08-01", description: "Biaya P2.4", amount: 1000000 },
    });
    const form = new FormData();
    form.set("file", new File(["doc"], "p2.4-dokumen.pdf", { type: "application/pdf" }));
    form.set("costDetailId", costDetail.json.data.id);
    await call(attachFile, { method: "POST", formData: form });

    const summary = await getClientSourceSummary(client.id, 1);
    expect(summary.count).toBe(1);
    expect(summary.recent).toHaveLength(1);
    expect(summary.recent[0].fileName).toBe("p2.4-dokumen.pdf");
    expect(summary.recent[0].originLabel).toContain("P2.4 Matter");

    const ids = summary.recent.map((s) => s.attachmentId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

async function makePayment(matterId: string, amount: number) {
  const txn = await call(createTransaction, {
    method: "POST",
    body: { transactionDate: "2026-08-01", amount, direction: "IN", matterId, description: "Payment awal" },
  });
  const payment = await call(classifyTransaction, {
    method: "POST",
    body: { financialType: "PAYMENT" },
    params: { id: txn.json.data.id },
  });
  return { transactionId: txn.json.data.id as string, paymentId: payment.json.data.id as string };
}

describe("Roadmap #2 — void endpoint direct regression (refactored into financialTransactionActions.ts)", () => {
  it("reason wajib diisi, transaksi jadi VOIDED dengan voidReason, double-void ditolak", async () => {
    const client = await makeClient("VoidDirect Client");
    const matter = await makeMatter(client.id, "VoidDirect Matter");
    const { transactionId } = await makePayment(matter.id, 1000000);

    const missingReason = await call(voidTransaction, { method: "POST", body: {}, params: { id: transactionId } });
    expect(missingReason.status).toBe(400);
    expect(missingReason.json.errorCode).toBe("VALIDATION_ERROR");

    const voided = await call(voidTransaction, {
      method: "POST",
      body: { reason: "Salah input nominal" },
      params: { id: transactionId },
    });
    expect(voided.status).toBe(200);
    expect(voided.json.data.status).toBe("VOIDED");
    expect(voided.json.data.voidReason).toBe("Salah input nominal");

    const again = await call(voidTransaction, {
      method: "POST",
      body: { reason: "coba lagi" },
      params: { id: transactionId },
    });
    expect(again.status).toBe(400);
    expect(again.json.errorCode).toBe("ALREADY_VOIDED");
  });
});

describe("Security fix — void/correct concurrency race (HIGH, security-agent review)", () => {
  // assertVoidable() reads status via the top-level `prisma` client,
  // outside and before the write transaction. The test above ("double-void
  // ditolak") only proves a *sequential* re-void is rejected — the first
  // call's whole `prisma.$transaction` has already resolved before the
  // second call's `assertVoidable` even runs, so that test would already
  // have passed before this fix and does NOT exercise the race. This test
  // reproduces the actual race: two write-transactions racing on the same
  // row, both started only after both requests already passed the
  // pre-check — the concurrent-shaped scenario the security review flagged
  // (two staff on the LAN, or a double-submit, void/correct-ing the same
  // transaction at nearly the same instant).
  it("dua write-transaction void yang benar-benar konkuren pada transaksi yang sama: hanya satu berhasil, yang lain ALREADY_VOIDED, tidak ada double-void", async () => {
    const client = await makeClient("ConcurrentVoid Client");
    const matter = await makeMatter(client.id, "ConcurrentVoid Matter");
    const { transactionId } = await makePayment(matter.id, 1000000);

    const { prisma } = await import("@/lib/prisma");
    const { ApiError } = await import("@/lib/apiResponse");
    const { assertVoidable, voidFinancialTransactionTx } = await import("@/lib/financialTransactionActions");

    // Both requests' pre-check passes — both see ACTIVE — before either
    // request's write transaction has even opened, let alone committed.
    const preCheckA = await assertVoidable(transactionId);
    const preCheckB = await assertVoidable(transactionId);
    expect(preCheckA.status).toBe("ACTIVE");
    expect(preCheckB.status).toBe("ACTIVE");

    // Neither $transaction call is awaited before the other starts: both
    // promises are created in the same tick, so these are two real,
    // concurrently-executing Prisma interactive transactions racing on the
    // same row at the database level — not a sequential call-then-call.
    const [resultA, resultB] = await Promise.allSettled([
      prisma.$transaction((tx) =>
        voidFinancialTransactionTx(tx, {
          transactionId,
          userId: "00000000-0000-0000-0000-000000000001",
          reason: "Race request A",
          previousStatus: preCheckA.status,
        })
      ),
      prisma.$transaction((tx) =>
        voidFinancialTransactionTx(tx, {
          transactionId,
          userId: "00000000-0000-0000-0000-000000000001",
          reason: "Race request B",
          previousStatus: preCheckB.status,
        })
      ),
    ]);

    const outcomes = [resultA, resultB];
    const fulfilled = outcomes.filter((r) => r.status === "fulfilled");
    const rejected = outcomes.filter((r) => r.status === "rejected");
    // Exactly one side of the race wins — not zero (the fix must not
    // block legitimate voids) and not two (the fix must not let both
    // through, which is the double-void bug itself).
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejection = rejected[0] as PromiseRejectedResult;
    expect(rejection.reason).toBeInstanceOf(ApiError);
    expect((rejection.reason as InstanceType<typeof ApiError>).errorCode).toBe("ALREADY_VOIDED");

    // Not just "one request failed" — prove there is no double-void
    // artifact left behind: exactly one VOID audit entry, transaction
    // VOIDED exactly once.
    const final = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: transactionId } });
    expect(final.status).toBe("VOIDED");
    const voidAuditCount = await prisma.auditLog.count({
      where: { entityType: "FINANCIAL_TRANSACTION", entityId: transactionId, action: "VOID" },
    });
    expect(voidAuditCount).toBe(1);
  });
});

describe("Security fix — reason/newAmount validation hardening (LOW, security-agent review)", () => {
  it("void: reason whitespace-only ditolak sebagai VALIDATION_ERROR (bukan lolos karena truthy string)", async () => {
    const client = await makeClient("VoidWhitespace Client");
    const matter = await makeMatter(client.id, "VoidWhitespace Matter");
    const { transactionId } = await makePayment(matter.id, 500000);

    const res = await call(voidTransaction, {
      method: "POST",
      body: { reason: "   " },
      params: { id: transactionId },
    });
    expect(res.status).toBe(400);
    expect(res.json.errorCode).toBe("VALIDATION_ERROR");
  });

  it("correct: reason whitespace-only dan newAmount non-numeric sama-sama ditolak sebagai VALIDATION_ERROR", async () => {
    const client = await makeClient("CorrectHardening Client");
    const matter = await makeMatter(client.id, "CorrectHardening Matter");
    const { paymentId } = await makePayment(matter.id, 1000000);

    const whitespaceReason = await call(correctPayment, {
      method: "POST",
      body: { reason: "   ", newAmount: 500000 },
      params: { id: paymentId },
    });
    expect(whitespaceReason.status).toBe(400);
    expect(whitespaceReason.json.errorCode).toBe("VALIDATION_ERROR");

    // Number("abc") is NaN and `NaN <= 0` is false — before this fix this
    // fell through validation entirely and hit a raw DB error instead of a
    // clean VALIDATION_ERROR.
    const nonNumericAmount = await call(correctPayment, {
      method: "POST",
      body: { reason: "Koreksi nominal", newAmount: "abc" },
      params: { id: paymentId },
    });
    expect(nonNumericAmount.status).toBe(400);
    expect(nonNumericAmount.json.errorCode).toBe("VALIDATION_ERROR");
  });
});

describe("Roadmap #2 — clearer payment correction workflow", () => {
  it("correct: transaksi lama di-void + transaksi baru dibuat, link dua arah tercatat di audit trail", async () => {
    const client = await makeClient("Correct Client");
    const matter = await makeMatter(client.id, "Correct Matter");
    const { transactionId, paymentId } = await makePayment(matter.id, 5000000);

    const corrected = await call(correctPayment, {
      method: "POST",
      body: { reason: "Salah input, seharusnya 7 juta", newAmount: 7000000, newDescription: "Payment dikoreksi" },
      params: { id: paymentId },
    });
    expect(corrected.status).toBe(201);
    expect(corrected.json.success).toBe(true);
    expect(corrected.json.data.voidedTransactionId).toBe(transactionId);
    expect(corrected.json.data.correctedTransactionId).not.toBe(transactionId);
    expect(corrected.json.data.correctedPaymentId).not.toBe(paymentId);

    // Old side: voided, and the link to the replacement is discoverable
    // straight from its own trace timeline (no schema change involved).
    const oldTrace = await call(getTrace, { params: { entryId: transactionId }, query: { entryType: "TRANSACTION" } });
    expect(oldTrace.json.data[0].currentStatus.transactionStatus).toBe("VOIDED");
    const voidEntry = oldTrace.json.data[0].timeline.find(
      (t: { action: string }) => t.action === "VOID"
    ) as { newValue: { correctedByTransactionId: string; correctedByPaymentId: string }; reason: string };
    expect(voidEntry).toBeDefined();
    expect(voidEntry.newValue.correctedByTransactionId).toBe(corrected.json.data.correctedTransactionId);
    expect(voidEntry.newValue.correctedByPaymentId).toBe(corrected.json.data.correctedPaymentId);
    expect(voidEntry.reason).toBe("Salah input, seharusnya 7 juta");

    // New side: right amount/description, same client/matter/classification
    // carried over, and the reverse link is discoverable from its own trace.
    const newTrace = await call(getTrace, {
      params: { entryId: corrected.json.data.correctedTransactionId },
      query: { entryType: "TRANSACTION" },
    });
    expect(newTrace.json.data[0].transaction.amount).toBe("7000000");
    expect(newTrace.json.data[0].transaction.description).toBe("Payment dikoreksi");
    expect(newTrace.json.data[0].nodes.matter.id).toBe(matter.id);
    expect(newTrace.json.data[0].nodes.client.id).toBe(client.id);
    expect(newTrace.json.data[0].currentStatus.financialType).toBe("PAYMENT");
    expect(newTrace.json.data[0].currentStatus.transactionStatus).toBe("ACTIVE");
    const createEntry = newTrace.json.data[0].timeline.find(
      (t: { action: string }) => t.action === "CREATE"
    ) as { previousValue: { correctsTransactionId: string; correctsPaymentId: string }; reason: string };
    expect(createEntry).toBeDefined();
    expect(createEntry.previousValue.correctsTransactionId).toBe(transactionId);
    expect(createEntry.previousValue.correctsPaymentId).toBe(paymentId);
    expect(createEntry.reason).toBe("Salah input, seharusnya 7 juta");

    // Position reflects only the corrected, active amount — the voided
    // original is excluded, not double-counted.
    const pos = await call(getMatterPosition, { params: { id: matter.id } });
    expect(pos.json.data.summary.totalPayment).toBe("7000000");
  });

  it("newTransactionDate diberikan -> dipakai; tidak diberikan -> ikut transaksi asal", async () => {
    const client = await makeClient("CorrectDate Client");
    const matter = await makeMatter(client.id, "CorrectDate Matter");
    const { paymentId } = await makePayment(matter.id, 2000000);

    const corrected = await call(correctPayment, {
      method: "POST",
      body: { reason: "Tanggal salah", newAmount: 2000000, newTransactionDate: "2026-08-05" },
      params: { id: paymentId },
    });
    expect(corrected.status).toBe(201);

    const newTrace = await call(getTrace, {
      params: { entryId: corrected.json.data.correctedTransactionId },
      query: { entryType: "TRANSACTION" },
    });
    expect(new Date(newTrace.json.data[0].transaction.date).toISOString().slice(0, 10)).toBe("2026-08-05");
  });

  it("validasi: reason dan newAmount wajib diisi, newAmount harus > 0", async () => {
    const client = await makeClient("CorrectValidation Client");
    const matter = await makeMatter(client.id, "CorrectValidation Matter");
    const { paymentId } = await makePayment(matter.id, 1000000);

    const noReason = await call(correctPayment, { method: "POST", body: { newAmount: 500000 }, params: { id: paymentId } });
    expect(noReason.status).toBe(400);
    expect(noReason.json.errorCode).toBe("VALIDATION_ERROR");

    const noAmount = await call(correctPayment, { method: "POST", body: { reason: "x" }, params: { id: paymentId } });
    expect(noAmount.status).toBe(400);
    expect(noAmount.json.errorCode).toBe("VALIDATION_ERROR");

    const negativeAmount = await call(correctPayment, {
      method: "POST",
      body: { reason: "x", newAmount: -100 },
      params: { id: paymentId },
    });
    expect(negativeAmount.status).toBe(400);
    expect(negativeAmount.json.errorCode).toBe("VALIDATION_ERROR");
  });

  it("payment tidak ditemukan -> 404", async () => {
    const res = await call(correctPayment, {
      method: "POST",
      body: { reason: "x", newAmount: 100000 },
      params: { id: "00000000-0000-0000-0000-000000000099" },
    });
    expect(res.status).toBe(404);
    expect(res.json.errorCode).toBe("NOT_FOUND");
  });

  it("payment dengan alokasi aktif tidak bisa dikoreksi sebelum di-reverse (aturan sama dengan void langsung, di-reuse lewat assertVoidable)", async () => {
    const client = await makeClient("CorrectBlocked Client");
    const matter = await makeMatter(client.id, "CorrectBlocked Matter");
    const invoice = await call(createInvoice, {
      method: "POST",
      body: {
        matterId: matter.id,
        invoiceNumber: `INV-CORRECT-${Date.now()}`,
        invoiceDate: "2026-08-01",
        totalAmount: 1000000,
        allowPartialPayment: true,
      },
    });
    const { transactionId, paymentId } = await makePayment(matter.id, 1000000);
    await call(allocatePayment, {
      method: "POST",
      body: { invoiceId: invoice.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 1000000 },
      params: { id: paymentId },
    });

    const res = await call(correctPayment, {
      method: "POST",
      body: { reason: "x", newAmount: 500000 },
      params: { id: paymentId },
    });
    expect(res.status).toBe(400);
    expect(res.json.errorCode).toBe("HAS_ACTIVE_ALLOCATIONS");

    // Nothing was voided or created — the whole composed action is one
    // atomic unit, and the pre-check runs before it even opens.
    const trace = await call(getTrace, { params: { entryId: transactionId }, query: { entryType: "TRANSACTION" } });
    expect(trace.json.data[0].currentStatus.transactionStatus).toBe("ACTIVE");
  });

  it("unauthenticated -> 401 (getCurrentUser gate, konsisten dengan semua route lain)", async () => {
    const res = await call(correctPayment, {
      method: "POST",
      body: { reason: "x", newAmount: 100000 },
      params: { id: "00000000-0000-0000-0000-000000000099" },
      unauthenticated: true,
    });
    expect(res.status).toBe(401);
  });
});

describe("Roadmap #1 — Sequential invoice numbering (suggestion + non-blocking sequence warning)", () => {
  // Synthetic, monotonically-distinct "years" (never a real calendar year,
  // never 2026 like the seed data) so each test's INV-{year}-{seq} rows are
  // fully isolated from every other test in this file, with no reliance on
  // execution order.
  let syntheticYear = 4900;

  it("GET ?suggestNext=true continues an existing per-year sequence", async () => {
    const { GET: getInvoices } = await import("@/app/api/invoices/route");
    const year = syntheticYear++;
    const client = await makeClient(`SeqSuggest Client ${year}`);
    const matter = await makeMatter(client.id, "SeqSuggest Matter");

    await call(createInvoice, {
      method: "POST",
      body: { matterId: matter.id, invoiceNumber: `INV-${year}-001`, invoiceDate: `${year}-01-10`, totalAmount: 1000000, allowPartialPayment: true },
    });
    await call(createInvoice, {
      method: "POST",
      body: { matterId: matter.id, invoiceNumber: `INV-${year}-002`, invoiceDate: `${year}-01-15`, totalAmount: 1000000, allowPartialPayment: true },
    });

    const suggestion = await call(getInvoices, { query: { suggestNext: "true", year: String(year) } });
    expect(suggestion.status).toBe(200);
    expect(suggestion.json.data).toEqual({ suggestedInvoiceNumber: `INV-${year}-003`, year });
  });

  it("GET ?suggestNext=true returns null (not an invented '...-001') when nothing exists yet for that year", async () => {
    const { GET: getInvoices } = await import("@/app/api/invoices/route");
    const year = syntheticYear++;

    const suggestion = await call(getInvoices, { query: { suggestNext: "true", year: String(year) } });
    expect(suggestion.status).toBe(200);
    expect(suggestion.json.data).toEqual({ suggestedInvoiceNumber: null, year });
  });

  it("GET ?suggestNext=true rejects a malformed year without touching the database", async () => {
    const { GET: getInvoices } = await import("@/app/api/invoices/route");
    const { status, json } = await call(getInvoices, { query: { suggestNext: "true", year: "abcd" } });
    expect(status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("POST an in-sequence invoiceNumber creates the invoice with sequenceWarning: null", async () => {
    const year = syntheticYear++;
    const client = await makeClient(`SeqOK Client ${year}`);
    const matter = await makeMatter(client.id, "SeqOK Matter");

    const first = await call(createInvoice, {
      method: "POST",
      body: { matterId: matter.id, invoiceNumber: `INV-${year}-001`, invoiceDate: `${year}-01-10`, totalAmount: 1000000, allowPartialPayment: true },
    });
    expect(first.status).toBe(201);
    expect(first.json.data.sequenceWarning).toBeNull();

    const second = await call(createInvoice, {
      method: "POST",
      body: { matterId: matter.id, invoiceNumber: `INV-${year}-002`, invoiceDate: `${year}-01-15`, totalAmount: 1000000, allowPartialPayment: true },
    });
    expect(second.status).toBe(201);
    expect(second.json.data.sequenceWarning).toBeNull();
  });

  it("POST still creates the invoice when invoiceNumber breaks sequence (never blocks), and returns a sequenceWarning", async () => {
    const year = syntheticYear++;
    const client = await makeClient(`SeqBreak Client ${year}`);
    const matter = await makeMatter(client.id, "SeqBreak Matter");

    await call(createInvoice, {
      method: "POST",
      body: { matterId: matter.id, invoiceNumber: `INV-${year}-001`, invoiceDate: `${year}-01-10`, totalAmount: 1000000, allowPartialPayment: true },
    });

    const skip = await call(createInvoice, {
      method: "POST",
      body: { matterId: matter.id, invoiceNumber: `INV-${year}-005`, invoiceDate: `${year}-01-20`, totalAmount: 1000000, allowPartialPayment: true },
    });
    // Non-blocking per CLAUDE.md §7 point 7: still 201, invoice really created.
    expect(skip.status).toBe(201);
    expect(skip.json.data.invoiceNumber).toBe(`INV-${year}-005`);
    expect(skip.json.data.sequenceWarning).toContain(`INV-${year}-002`);
  });

  it("POST leaves a manual-override invoiceNumber (doesn't match INV-{year}-{seq}) with sequenceWarning: null", async () => {
    const client = await makeClient("SeqCustom Client");
    const matter = await makeMatter(client.id, "SeqCustom Matter");

    const custom = await call(createInvoice, {
      method: "POST",
      body: {
        matterId: matter.id,
        invoiceNumber: `CUSTOM-SCHEME-${Date.now()}`,
        invoiceDate: "2026-08-01",
        totalAmount: 1000000,
        allowPartialPayment: true,
      },
    });
    expect(custom.status).toBe(201);
    expect(custom.json.data.sequenceWarning).toBeNull();
  });
});

describe("Allocation remaining-balance indicator (PAINKILLER_COVERAGE_AUDIT.md §7.4) — GET /api/invoices exposes active allocations", () => {
  // AllocateInline's "Sisa tagihan invoice" text (src/components/TransactionActions.tsx,
  // invoiceOutstanding()) is computed client-side from exactly this response shape:
  // Number(invoice.totalAmount) - sum(invoice.allocations[].amount). No test anywhere
  // else in this file exercises the plain (non-suggestNext) GET /api/invoices response
  // shape, so this closes that gap with the exact expected numbers, not just "has a
  // field called allocations".
  it("returns each invoice's ACTIVE allocations, and excludes REVERSED ones, so outstanding = totalAmount - sum(active allocations) computes correctly", async () => {
    const { GET: getInvoices } = await import("@/app/api/invoices/route");
    const { POST: reverseAllocation } = await import("@/app/api/payment-allocations/[id]/reverse/route");

    const client = await makeClient("RemainingBalance Client");
    const matter = await makeMatter(client.id, "RemainingBalance Matter");

    const invoice = await call(createInvoice, {
      method: "POST",
      body: {
        matterId: matter.id,
        invoiceNumber: `RB-INDICATOR-${Date.now()}`,
        invoiceDate: "2026-08-01",
        totalAmount: 10000000,
        allowPartialPayment: true,
      },
    });
    expect(invoice.status).toBe(201);

    const { paymentId } = await makePayment(matter.id, 6000000);
    const allocation = await call(allocatePayment, {
      method: "POST",
      body: { invoiceId: invoice.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 4000000 },
      params: { id: paymentId },
    });
    expect(allocation.status).toBe(201);

    const list = await call(getInvoices, { query: { matterId: matter.id } });
    expect(list.status).toBe(200);
    const found = list.json.data.find((i: { id: string }) => i.id === invoice.json.data.id);
    expect(found).toBeDefined();
    expect(found.totalAmount).toBe("10000000");
    expect(found.allocations).toHaveLength(1);
    expect(found.allocations[0].amount).toBe("4000000");

    const outstanding =
      Number(found.totalAmount) - found.allocations.reduce((sum: number, a: { amount: string }) => sum + Number(a.amount), 0);
    expect(outstanding).toBe(6000000);

    // Reversing the allocation must remove it from this field, not just flip a
    // status the UI ignores — otherwise "sisa tagihan" would silently understate
    // what's actually still owed after a correction.
    const reversed = await call(reverseAllocation, {
      method: "POST",
      body: { reason: "QA: prove reversed allocations are excluded from the indicator" },
      params: { id: allocation.json.data.id },
    });
    expect(reversed.status).toBe(200);

    const afterReverse = await call(getInvoices, { query: { matterId: matter.id } });
    const foundAfterReverse = afterReverse.json.data.find((i: { id: string }) => i.id === invoice.json.data.id);
    expect(foundAfterReverse.allocations).toHaveLength(0);
    const outstandingAfterReverse = Number(foundAfterReverse.totalAmount) - 0;
    expect(outstandingAfterReverse).toBe(10000000);
  });
});

describe("Roadmap #3 — Structured per-bank disbursement categorization", () => {
  it("POST /api/bank-accounts requires bankName", async () => {
    const { POST: createBankAccount } = await import("@/app/api/bank-accounts/route");
    const { status, json } = await call(createBankAccount, { method: "POST", body: {} });
    expect(status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("POST /api/bank-accounts creates a bank account (status defaults ACTIVE) with a CREATE audit entry", async () => {
    const { POST: createBankAccount } = await import("@/app/api/bank-accounts/route");
    const { GET: getAuditLog } = await import("@/app/api/audit-log/route");

    const created = await call(createBankAccount, {
      method: "POST",
      body: { bankName: "BCA", accountName: "Operasional", accountNumber: "1234567890" },
    });
    expect(created.status).toBe(201);
    expect(created.json.data.bankName).toBe("BCA");
    expect(created.json.data.accountName).toBe("Operasional");
    expect(created.json.data.status).toBe("ACTIVE");

    const audit = await call(getAuditLog, { query: { entityType: "BANK_ACCOUNT", entityId: created.json.data.id } });
    expect(audit.status).toBe(200);
    expect(audit.json.data.some((e: { action: string }) => e.action === "CREATE")).toBe(true);
  });

  it("GET /api/bank-accounts supports ?search= by bank name, for the disbursement entry dropdown/typeahead", async () => {
    const { POST: createBankAccount, GET: listBankAccounts } = await import("@/app/api/bank-accounts/route");
    const unique = `Bank Roadmap3 ${Date.now()}`;
    await call(createBankAccount, { method: "POST", body: { bankName: unique } });

    const list = await call(listBankAccounts, { query: { search: unique } });
    expect(list.status).toBe(200);
    expect(list.json.data).toHaveLength(1);
    expect(list.json.data[0].bankName).toBe(unique);
  });

  it("PATCH /api/bank-accounts/[id] relabels (UPDATE) and changes status (STATUS_CHANGE), both audited", async () => {
    const { POST: createBankAccount } = await import("@/app/api/bank-accounts/route");
    const { PATCH: patchBankAccount } = await import("@/app/api/bank-accounts/[id]/route");
    const { GET: getAuditLog } = await import("@/app/api/audit-log/route");

    const created = await call(createBankAccount, { method: "POST", body: { bankName: "Mandiri" } });
    const id = created.json.data.id;

    const relabel = await call(patchBankAccount, { method: "PATCH", params: { id }, body: { accountName: "RPL Notaris" } });
    expect(relabel.status).toBe(200);
    expect(relabel.json.data.accountName).toBe("RPL Notaris");
    expect(relabel.json.data.status).toBe("ACTIVE"); // untouched field preserved

    const deactivate = await call(patchBankAccount, {
      method: "PATCH",
      params: { id },
      body: { status: "INACTIVE", reason: "Rekening ditutup" },
    });
    expect(deactivate.status).toBe(200);
    expect(deactivate.json.data.status).toBe("INACTIVE");

    const audit = await call(getAuditLog, { query: { entityType: "BANK_ACCOUNT", entityId: id } });
    const actions = audit.json.data.map((e: { action: string }) => e.action);
    expect(actions).toContain("UPDATE");
    expect(actions).toContain("STATUS_CHANGE");
  });

  it("classify DISBURSEMENT with bankAccountId records the funding account on the Disbursement row and its audit snapshot", async () => {
    const { POST: createBankAccount } = await import("@/app/api/bank-accounts/route");
    const { GET: listDisbursements } = await import("@/app/api/disbursements/route");
    const { GET: getAuditLog } = await import("@/app/api/audit-log/route");

    const client = await makeClient("BankRoadmap Client");
    const matter = await makeMatter(client.id, "BankRoadmap Matter");
    const bankAccount = await call(createBankAccount, { method: "POST", body: { bankName: "BNI", accountName: "Operasional" } });

    const txn = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-08-01", amount: 2500000, direction: "OUT", matterId: matter.id, description: "Bayar PNBP" },
    });
    const disbursement = await call(classifyTransaction, {
      method: "POST",
      body: { financialType: "DISBURSEMENT", category: "PNBP", bankAccountId: bankAccount.json.data.id },
      params: { id: txn.json.data.id },
    });
    expect(disbursement.status).toBe(201);
    expect(disbursement.json.data.bankAccountId).toBe(bankAccount.json.data.id);

    const list = await call(listDisbursements, { query: { matterId: matter.id } });
    const found = list.json.data.find((d: { id: string }) => d.id === disbursement.json.data.id);
    expect(found?.bankAccountId).toBe(bankAccount.json.data.id);

    // Decision record's claim: no separate writeAuditLog call needed for
    // bankAccountId — the existing CREATE entry already snapshots the full
    // created row. Assert that's actually true, not just "doesn't throw".
    const audit = await call(getAuditLog, { query: { entityType: "DISBURSEMENT", entityId: disbursement.json.data.id } });
    const createEntry = audit.json.data.find((e: { action: string }) => e.action === "CREATE");
    expect(createEntry?.newValue?.bankAccountId).toBe(bankAccount.json.data.id);
  });

  it("buildTransactionTrace() and getMatterFinancialPosition() both surface the joined BankAccount (bankName), not just the raw bankAccountId, on the disbursement", async () => {
    // QA-found gap (this session): bankAccountId persisted correctly but was
    // never joined for display in trace.ts/position.ts. A frontend-agent fix
    // added `disbursement: { include: { bankAccount: true } }` to both — this
    // test pins that down so an accidental revert to a bare `disbursement:
    // true` regresses loudly here instead of silently (the field would just
    // become `undefined`, which build/lint/typecheck would not catch).
    const { POST: createBankAccount } = await import("@/app/api/bank-accounts/route");

    const client = await makeClient("BankRoadmap TraceDisplay Client");
    const matter = await makeMatter(client.id, "BankRoadmap TraceDisplay Matter");
    const uniqueBankName = `BRI TraceDisplay ${Date.now()}`;
    const bankAccount = await call(createBankAccount, {
      method: "POST",
      body: { bankName: uniqueBankName, accountName: "Operasional Trace" },
    });

    const txn = await call(createTransaction, {
      method: "POST",
      body: {
        transactionDate: "2026-08-01",
        amount: 1500000,
        direction: "OUT",
        matterId: matter.id,
        description: "Bayar PNBP untuk verifikasi join bank account",
      },
    });
    const disbursement = await call(classifyTransaction, {
      method: "POST",
      body: { financialType: "DISBURSEMENT", category: "PNBP", bankAccountId: bankAccount.json.data.id },
      params: { id: txn.json.data.id },
    });
    expect(disbursement.status).toBe(201);
    expect(disbursement.json.data.bankAccountId).toBe(bankAccount.json.data.id);

    // buildTransactionTrace() — src/lib/trace.ts
    const trace = await call(getTrace, { params: { entryId: txn.json.data.id }, query: { entryType: "TRANSACTION" } });
    expect(trace.status).toBe(200);
    expect(trace.json.data[0].nodes.disbursement.bankAccountId).toBe(bankAccount.json.data.id);
    expect(trace.json.data[0].nodes.disbursement.bankAccount?.id).toBe(bankAccount.json.data.id);
    expect(trace.json.data[0].nodes.disbursement.bankAccount?.bankName).toBe(uniqueBankName);

    // getMatterFinancialPosition() — src/lib/position.ts computeTransactionBucket()
    const pos = await call(getMatterPosition, { params: { id: matter.id } });
    expect(pos.status).toBe(200);
    const disbursementRow = pos.json.data.detail.disbursements.find(
      (d: { transactionId: string }) => d.transactionId === txn.json.data.id
    );
    expect(disbursementRow).toBeDefined();
    expect(disbursementRow.bankAccount?.id).toBe(bankAccount.json.data.id);
    expect(disbursementRow.bankAccount?.bankName).toBe(uniqueBankName);
  });
});

describe("QA fix (this session) — Transaction Trace AllocateInline must use the real Payment.id, not FinancialTransaction.id", () => {
  it("buildTransactionTrace() exposes nodes.classification.paymentId as the actual Payment.id (distinct from the FinancialTransaction id), and allocating against it succeeds where allocating against the transaction id 404s", async () => {
    const client = await makeClient(`TracePaymentId Client ${Date.now()}`);
    const matter = await makeMatter(client.id, "TracePaymentId Matter");
    const invoice = await call(createInvoice, {
      method: "POST",
      body: {
        matterId: matter.id,
        invoiceNumber: `INV-TRACEID-${Date.now()}`,
        invoiceDate: "2026-08-01",
        totalAmount: 10000000,
        allowPartialPayment: true,
      },
    });
    const txn = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-08-01", amount: 4000000, direction: "IN", matterId: matter.id, description: "Payment for trace paymentId regression" },
    });
    const classified = await call(classifyTransaction, {
      method: "POST",
      body: { financialType: "PAYMENT" },
      params: { id: txn.json.data.id },
    });
    expect(classified.status).toBe(201);
    const realPaymentId = classified.json.data.id as string;
    // The bug: FinancialTransaction.id and Payment.id are separately generated
    // UUIDs, never equal. If this assertion ever fails it means the fixture
    // changed in a way that would mask the regression below.
    expect(realPaymentId).not.toBe(txn.json.data.id);

    const trace = await call(getTrace, { params: { entryId: txn.json.data.id }, query: { entryType: "TRANSACTION" } });
    expect(trace.status).toBe(200);
    expect(trace.json.data[0].nodes.classification.paymentId).toBe(realPaymentId);

    // Pre-fix behavior: TransactionTraceView passed transaction.id (the
    // FinancialTransaction id) as `paymentId` to AllocateInline, which POSTs
    // to /api/payments/[id]/allocate — a lookup by Payment.id. Prove that
    // would 404, i.e. this test would have failed against the pre-fix code.
    const allocateWithTransactionId = await call(allocatePayment, {
      method: "POST",
      body: { invoiceId: invoice.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 4000000 },
      params: { id: txn.json.data.id },
    });
    expect(allocateWithTransactionId.status).toBe(404);

    // Post-fix behavior: allocating using nodes.classification.paymentId (what
    // TransactionTraceView now passes to AllocateInline) succeeds.
    const allocateWithRealPaymentId = await call(allocatePayment, {
      method: "POST",
      body: { invoiceId: invoice.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 4000000 },
      params: { id: realPaymentId },
    });
    expect(allocateWithRealPaymentId.status).toBe(201);
    expect(allocateWithRealPaymentId.json.data.paymentId).toBe(realPaymentId);
    expect(allocateWithRealPaymentId.json.data.invoiceId).toBe(invoice.json.data.id);

    const pos = await call(getMatterPosition, { params: { id: matter.id } });
    const invoiceRow = pos.json.data.detail.invoices.find((i: { invoiceId: string }) => i.invoiceId === invoice.json.data.id);
    expect(invoiceRow.paymentStatus).toBe("PARTIALLY_PAID");
  });
});

// Painkiller #10 ("Tracking payment pihak ketiga") — /disbursements' new
// "Disbursement by Bank Account" summary card. The query itself lives in
// src/lib/listAggregates.ts (fetch-then-reduce-in-memory, same shape as its
// sibling getClientListWithAggregates() and dashboard.ts) rather than inline
// in the page, specifically so it's directly testable here against a real
// DB the same way getDashboardSummaryCards()/getUnlinkedBacklogAging() are
// tested above — a scenario test can't call the page component itself
// (it's not a route handler), but it can call the read-model function.
describe("Painkiller #10 — Per-bank-account disbursement summary aggregation (src/lib/listAggregates.ts)", () => {
  it("getDisbursementSummaryByBankAccount() sums disbursement amounts per bank account, sorted descending by total, with count", async () => {
    const { POST: createBankAccount } = await import("@/app/api/bank-accounts/route");
    const { getDisbursementSummaryByBankAccount } = await import("@/lib/listAggregates");

    const client = await makeClient(`BankSummary Client ${Date.now()}`);
    const matter = await makeMatter(client.id, "BankSummary Matter");
    const bankA = await call(createBankAccount, { method: "POST", body: { bankName: `BankSummary A ${Date.now()}` } });
    const bankB = await call(createBankAccount, { method: "POST", body: { bankName: `BankSummary B ${Date.now()}` } });

    async function makeDisbursement(amount: number, bankAccountId: string) {
      const txn = await call(createTransaction, {
        method: "POST",
        body: { transactionDate: "2026-08-01", amount, direction: "OUT", matterId: matter.id, description: "Bank summary disbursement" },
      });
      return call(classifyTransaction, {
        method: "POST",
        body: { financialType: "DISBURSEMENT", category: "PNBP", bankAccountId },
        params: { id: txn.json.data.id },
      });
    }

    await makeDisbursement(1_000_000, bankA.json.data.id);
    await makeDisbursement(500_000, bankA.json.data.id);
    await makeDisbursement(750_000, bankB.json.data.id);

    const summary = await getDisbursementSummaryByBankAccount();
    const bucketA = summary.find((s) => s.key === bankA.json.data.id);
    const bucketB = summary.find((s) => s.key === bankB.json.data.id);
    expect(bucketA?.total).toBe(1_500_000);
    expect(bucketA?.count).toBe(2);
    expect(bucketA?.bankAccount?.bankName).toBe(bankA.json.data.bankName);
    expect(bucketB?.total).toBe(750_000);
    expect(bucketB?.count).toBe(1);

    // Sorted descending by total — bucketA (1.5M) must appear before bucketB (750k).
    const indexA = summary.findIndex((s) => s.key === bankA.json.data.id);
    const indexB = summary.findIndex((s) => s.key === bankB.json.data.id);
    expect(indexA).toBeLessThan(indexB);
  });

  it("disbursements with no bankAccountId recorded land in the 'none' bucket with bankAccount: null (nullable FK, e.g. pre-v18 rows)", async () => {
    const { getDisbursementSummaryByBankAccount, UNASSIGNED_BANK_ACCOUNT_KEY } = await import("@/lib/listAggregates");

    const client = await makeClient(`BankSummary Unassigned Client ${Date.now()}`);
    const matter = await makeMatter(client.id, "BankSummary Unassigned Matter");
    const txn = await call(createTransaction, {
      method: "POST",
      body: { transactionDate: "2026-08-01", amount: 250000, direction: "OUT", matterId: matter.id, description: "Disbursement without bank account" },
    });
    const disbursement = await call(classifyTransaction, {
      method: "POST",
      body: { financialType: "DISBURSEMENT", category: "PNBP" },
      params: { id: txn.json.data.id },
    });
    expect(disbursement.status).toBe(201);
    expect(disbursement.json.data.bankAccountId).toBeNull();

    const summary = await getDisbursementSummaryByBankAccount();
    const noneBucket = summary.find((s) => s.key === UNASSIGNED_BANK_ACCOUNT_KEY);
    expect(noneBucket).toBeDefined();
    expect(noneBucket?.bankAccount).toBeNull();
    // Global bucket — other fixtures/seed data land here too, so assert this
    // disbursement's amount is reflected in the running total, not that it's
    // the only entry.
    expect(noneBucket!.total).toBeGreaterThanOrEqual(250000);
    expect(noneBucket!.count).toBeGreaterThanOrEqual(1);
  });
});
