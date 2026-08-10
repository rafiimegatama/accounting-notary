import { describe, it, expect } from "vitest";
import { call } from "../helpers/callApi";

import { POST as createClient } from "@/app/api/clients/route";
import { POST as createMatter } from "@/app/api/matters/route";
import { GET as getTransactions, POST as createTransaction } from "@/app/api/transactions/route";
import { POST as linkTransaction } from "@/app/api/transactions/[id]/link/route";
import { POST as classifyTransaction } from "@/app/api/transactions/[id]/classify/route";
import { POST as createInvoice } from "@/app/api/invoices/route";
import { POST as allocatePayment } from "@/app/api/payments/[id]/allocate/route";
import { GET as getTrace } from "@/app/api/trace/[entryId]/route";
import { GET as search } from "@/app/api/search/route";
import { POST as attachFile } from "@/app/api/attachments/route";
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
