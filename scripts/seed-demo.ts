// DEMO DATA — Section 35. Development-only seed, clearly separate from
// production data (this script is never invoked automatically; run it
// explicitly with `npx tsx scripts/seed-demo.ts` against a dev database).
//
// Goes through the actual route handlers (same helper pattern as the test
// suite), not raw Prisma inserts, so audit trail / review_status / all
// business rules are populated exactly as they would be by a real user —
// this is demo data, not a database backdoor.
process.loadEnvFile(".env");

import { prisma } from "../src/lib/prisma";
import { hashPin } from "../src/lib/session";
import { call } from "../tests/helpers/callApi";

import { POST as createClient } from "../src/app/api/clients/route";
import { POST as createMatter } from "../src/app/api/matters/route";
import { POST as createTransaction } from "../src/app/api/transactions/route";
import { POST as linkTransaction } from "../src/app/api/transactions/[id]/link/route";
import { POST as classifyTransaction } from "../src/app/api/transactions/[id]/classify/route";
import { POST as createInvoice } from "../src/app/api/invoices/route";
import { POST as allocatePayment } from "../src/app/api/payments/[id]/allocate/route";
import { PATCH as patchTransaction } from "../src/app/api/transactions/[id]/route";
import { POST as createCostDetail } from "../src/app/api/cost-details/route";

async function main() {
  console.log("Seeding demo data (DEMO DATA — development only)...");

  // --- Staff (direct Prisma insert; no staff-management API exists yet) ---
  const staffNames = ["Sri Wahyuni", "Budi Santoso", "Dewi Anggraini"];
  for (const name of staffNames) {
    const existing = await prisma.staff.findFirst({ where: { name } });
    if (existing) continue;
    const { hash, salt } = hashPin("1234");
    await prisma.staff.create({ data: { name, pinHash: hash, pinSalt: salt } });
  }
  console.log(`Staff ready (PIN 1234 for all): ${staffNames.join(", ")}`);
  const staffName = "Sri Wahyuni";

  // --- Client 1: PT Nusantara Properti — Akta Jual Beli, full happy path ---
  const client1 = await call(createClient, { staffName, method: "POST", body: { name: "PT Nusantara Properti", clientType: "COMPANY" } });
  const matter1 = await call(createMatter, {
    staffName,
    method: "POST",
    body: { clientId: client1.json.data.id, matterName: "Akta Jual Beli Tanah Kavling No. 12", matterType: "Akta Jual Beli", responsibleStaff: staffName },
  });
  const matterId1 = matter1.json.data.id;

  // Cost details — realistic notary categories
  await call(createCostDetail, { staffName, method: "POST", body: { matterId: matterId1, costDate: "2026-07-05", description: "PNBP Pengecekan Sertifikat", category: "PNBP", amount: 500000 } });
  await call(createCostDetail, { staffName, method: "POST", body: { matterId: matterId1, costDate: "2026-07-08", description: "BPHTB", category: "BPHTB", amount: 25000000 } });
  await call(createCostDetail, { staffName, method: "POST", body: { matterId: matterId1, costDate: "2026-07-08", description: "Honorarium Notaris", category: "Honorarium", amount: 15000000 } });
  await call(createCostDetail, { staffName, method: "POST", body: { matterId: matterId1, costDate: "2026-07-08", description: "Materai", category: "Materai", amount: 30000 } });

  // Invoice — full, allows partial payment, demonstrates multi-invoice allocation
  const invoiceA = await call(createInvoice, {
    staffName, method: "POST",
    body: { matterId: matterId1, invoiceNumber: "INV-2026-001", invoiceDate: "2026-07-10", dueDate: "2026-08-10", totalAmount: 40000000, allowPartialPayment: true },
  });
  const invoiceB = await call(createInvoice, {
    staffName, method: "POST",
    body: { matterId: matterId1, invoiceNumber: "INV-2026-002", invoiceDate: "2026-07-15", dueDate: "2026-08-15", totalAmount: 10000000, allowPartialPayment: true },
  });

  // Payment: one transaction paying across two invoices (Scenario 9 pattern)
  const payTxn = await call(createTransaction, {
    staffName, method: "POST",
    body: { transactionDate: "2026-07-20", amount: 30000000, direction: "IN", matterId: matterId1, description: "Transfer pelunasan sebagian - BCA", sourceType: "BANK_STATEMENT", sourceReference: "Rekening Koran Juli 2026 hal. 3" },
  });
  const payment1 = await call(classifyTransaction, { staffName, method: "POST", body: { financialType: "PAYMENT" }, params: { id: payTxn.json.data.id } });
  await call(allocatePayment, { staffName, method: "POST", body: { invoiceId: invoiceA.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 20000000 }, params: { id: payment1.json.data.id } });
  await call(allocatePayment, { staffName, method: "POST", body: { invoiceId: invoiceB.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 10000000 }, params: { id: payment1.json.data.id } });

  // Deposit + Disbursement for the same matter
  const depositTxn = await call(createTransaction, {
    staffName, method: "POST",
    body: { transactionDate: "2026-07-06", amount: 26000000, direction: "IN", matterId: matterId1, description: "Titipan biaya BPHTB & PNBP", sourceType: "WHATSAPP", sourceReference: "Chat konfirmasi transfer titipan, 6 Juli 2026" },
  });
  await call(classifyTransaction, { staffName, method: "POST", body: { financialType: "DEPOSIT" }, params: { id: depositTxn.json.data.id } });

  const disbursementTxn = await call(createTransaction, {
    staffName, method: "POST",
    body: { transactionDate: "2026-07-08", amount: 25500000, direction: "OUT", matterId: matterId1, description: "Pembayaran BPHTB & PNBP ke kas negara" },
  });
  await call(classifyTransaction, { staffName, method: "POST", body: { financialType: "DISBURSEMENT", category: "BPHTB & PNBP" }, params: { id: disbursementTxn.json.data.id } });

  // --- Client 2: Ibu Ratna Kusuma — Pendirian PT, REVIEW_REQUIRED demo ---
  const client2 = await call(createClient, { staffName, method: "POST", body: { name: "Ratna Kusuma", clientType: "INDIVIDUAL" } });
  const matter2 = await call(createMatter, { staffName, method: "POST", body: { clientId: client2.json.data.id, matterName: "Pendirian PT Kusuma Abadi", matterType: "Pendirian PT" } });
  const matterId2 = matter2.json.data.id;

  const strictInvoice = await call(createInvoice, {
    staffName, method: "POST",
    body: { matterId: matterId2, invoiceNumber: "INV-2026-003", invoiceDate: "2026-07-12", totalAmount: 15000000, allowPartialPayment: false },
  });
  const partialTxn = await call(createTransaction, {
    staffName, method: "POST",
    body: { transactionDate: "2026-07-18", amount: 7000000, direction: "IN", matterId: matterId2, description: "Transfer sebagian - tidak sesuai kesepakatan lunas" },
  });
  const payment2 = await call(classifyTransaction, { staffName, method: "POST", body: { financialType: "PAYMENT" }, params: { id: partialTxn.json.data.id } });
  // This allocation triggers REVIEW_REQUIRED: strictInvoice.allowPartialPayment = false
  await call(allocatePayment, { staffName, method: "POST", body: { invoiceId: strictInvoice.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 7000000 }, params: { id: payment2.json.data.id } });

  // --- Unlinked transactions (pain #5, 10/10 — must stay valid, non-error) ---
  await call(createTransaction, {
    staffName, method: "POST",
    body: { transactionDate: "2026-07-22", amount: 5000000, direction: "IN", description: "Transfer masuk, belum jelas untuk client/matter mana", sourceType: "BANK_STATEMENT", sourceReference: "Rekening Koran Juli 2026 hal. 5" },
  });
  await call(createTransaction, {
    staffName, method: "POST",
    body: { transactionDate: "2026-07-23", amount: 1200000, direction: "OUT", description: "Pengeluaran belum teridentifikasi" },
  });

  // --- Transaction with SOURCE_PENDING → WARNING demo ---
  await call(createTransaction, {
    staffName, method: "POST",
    body: { transactionDate: "2026-07-24", amount: 750000, direction: "IN", matterId: matterId1, description: "Transfer masuk, sumber belum dikonfirmasi" },
  });

  // --- Demonstrate a link correction (timeline: LINK then RELINK) ---
  const relinkDemo = await call(createTransaction, {
    staffName, method: "POST",
    body: { transactionDate: "2026-07-25", amount: 2000000, direction: "IN", description: "Contoh transaksi yang salah link lalu dikoreksi" },
  });
  await call(linkTransaction, { staffName, method: "POST", body: { action: "LINK_MATTER", matterId: matterId2 }, params: { id: relinkDemo.json.data.id } });
  await call(linkTransaction, {
    staffName, method: "POST",
    body: { action: "LINK_MATTER", matterId: matterId1, reason: "Salah pilih matter saat input awal" },
    params: { id: relinkDemo.json.data.id },
  });
  await call(patchTransaction, { staffName, method: "PATCH", body: { notes: "Dikoreksi setelah konfirmasi dengan klien." }, params: { id: relinkDemo.json.data.id } });

  console.log("Demo data seeded successfully.");
  console.log(`Client 1: ${client1.json.data.name} (${client1.json.data.id})`);
  console.log(`Client 2: ${client2.json.data.name} (${client2.json.data.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
