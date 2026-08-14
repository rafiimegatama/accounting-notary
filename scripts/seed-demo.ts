// DEMO DATA — Section 35. Development-only seed, clearly separate from
// production data (this script is never invoked automatically; run it
// explicitly with `npx tsx scripts/seed-demo.ts` against a dev database).
//
// Goes through the actual route handlers (same helper pattern as the test
// suite), not raw Prisma inserts, so audit trail / review_status / all
// business rules are populated exactly as they would be by a real user —
// this is demo data, not a database backdoor.
//
// DEMO DATA ONLY — NOT FOR PRODUCTION. All names below are fictional.
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
import { POST as attachFile } from "../src/app/api/attachments/route";

async function main() {
  console.log("Seeding demo data (DEMO DATA — development only)...");

  // Idempotency guard (Step 22): financial tables can't be deleted by
  // design (see prevent_delete() triggers in ddl_notary_financial_control.sql),
  // so "wipe and reseed" isn't an option here. This flags (not returns)
  // so later, independently-idempotent sections (e.g. the payment top-up
  // near the end) can still run on a subsequent invocation.
  const extendedDatasetExists = !!(await prisma.client.findFirst({ where: { name: "PT Arunika Properti" } }));
  if (extendedDatasetExists) {
    console.log("Extended dataset already present (found 'PT Arunika Properti') — will not re-create clients/matters.");
  }

  // --- Staff (direct Prisma insert; no staff-management API exists yet) ---
  const staffNames = ["Sri Wahyuni", "Irfani Utami", "Dewi Anggraini"];
  for (const name of staffNames) {
    const existing = await prisma.staff.findFirst({ where: { name } });
    if (existing) continue;
    const { hash, salt } = hashPin("1234");
    await prisma.staff.create({ data: { name, pinHash: hash, pinSalt: salt } });
  }
  console.log(`Staff ready (PIN 1234 for all): ${staffNames.join(", ")}`);
  const staffName = "Sri Wahyuni";

  // The original 2-client block is independently idempotent (it has its
  // own hardcoded invoice numbers INV-2026-001..003, so blindly re-running
  // it collides on the unique constraint) — check first, fetch instead of
  // re-creating if it already ran in a previous pass. Downstream extended
  // code only needs the plain ids/names below, not the call() result shape.
  let client1Id: string, client1Name: string, matterId1: string;
  let client2Id: string, client2Name: string, matterId2: string;
  let payTxnId: string, invoiceAId: string;

  const existingOriginal = await prisma.client.findFirst({ where: { name: "PT Nusantara Properti" } });
  if (existingOriginal) {
    console.log("Original 2-client block already present — fetching instead of re-creating.");
    client1Id = existingOriginal.id;
    client1Name = existingOriginal.name;
    const m1 = await prisma.matter.findFirstOrThrow({ where: { clientId: client1Id } });
    matterId1 = m1.id;
    const client2 = await prisma.client.findFirstOrThrow({ where: { name: "Ratna Kusuma" } });
    client2Id = client2.id;
    client2Name = client2.name;
    const m2 = await prisma.matter.findFirstOrThrow({ where: { clientId: client2Id } });
    matterId2 = m2.id;
    const invA = await prisma.invoice.findFirstOrThrow({ where: { matterId: matterId1 }, orderBy: { invoiceNumber: "asc" } });
    invoiceAId = invA.id;
    const payTxn = await prisma.financialTransaction.findFirstOrThrow({ where: { matterId: matterId1, financialType: "PAYMENT" } });
    payTxnId = payTxn.id;
  } else {
    // --- Client 1: PT Nusantara Properti — Akta Jual Beli, full happy path ---
    const client1 = await call(createClient, { staffName, method: "POST", body: { name: "PT Nusantara Properti", clientType: "COMPANY" } });
    const matter1 = await call(createMatter, {
      staffName,
      method: "POST",
      body: { clientId: client1.json.data.id, matterName: "Akta Jual Beli Tanah Kavling No. 12", matterType: "Akta Jual Beli", responsibleStaff: staffName },
    });
    client1Id = client1.json.data.id;
    client1Name = client1.json.data.name;
    matterId1 = matter1.json.data.id;

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
    invoiceAId = invoiceA.json.data.id;
    const invoiceB = await call(createInvoice, {
      staffName, method: "POST",
      body: { matterId: matterId1, invoiceNumber: "INV-2026-002", invoiceDate: "2026-07-15", dueDate: "2026-08-15", totalAmount: 10000000, allowPartialPayment: true },
    });

    // Payment: one transaction paying across two invoices (Scenario 9 pattern)
    const payTxn = await call(createTransaction, {
      staffName, method: "POST",
      body: { transactionDate: "2026-07-20", amount: 30000000, direction: "IN", matterId: matterId1, description: "Transfer pelunasan sebagian - BCA", sourceType: "BANK_STATEMENT", sourceReference: "Rekening Koran Juli 2026 hal. 3" },
    });
    payTxnId = payTxn.json.data.id;
    const payment1 = await call(classifyTransaction, { staffName, method: "POST", body: { financialType: "PAYMENT" }, params: { id: payTxnId } });
    await call(allocatePayment, { staffName, method: "POST", body: { invoiceId: invoiceAId, allocationType: "INVOICE_PAYMENT", amount: 20000000 }, params: { id: payment1.json.data.id } });
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
    client2Id = client2.json.data.id;
    client2Name = client2.json.data.name;
    matterId2 = matter2.json.data.id;

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

    console.log("Original demo data seeded.");
  }
  console.log(`Client 1: ${client1Name} (${client1Id})`);
  console.log(`Client 2 id: ${client2Id}`);

  // ============================================================
  // EXTENDED DEMO DATASET — realistic small/medium notary office
  // (Steps 3–19 of the "Seed Realistic Demo Data" master prompt)
  // ============================================================
  console.log("Seeding extended dataset...");

  const STAFF_ROTATION = staffNames;
  const staffFor = (i: number) => STAFF_ROTATION[i % STAFF_ROTATION.length];

  // Monotonically increasing date cursor, ~Feb 2026 -> Aug 2026 (spec: 3–6
  // bulan terakhir before "today", 2026-08-11). Small varying steps give a
  // natural, non-uniform spread instead of a mechanical daily cadence.
  const BASE_DATE = new Date("2026-02-16");
  let dayCursor = 0;
  function nextDate(step = 2): string {
    dayCursor += step;
    const d = new Date(BASE_DATE);
    d.setDate(d.getDate() + dayCursor);
    return d.toISOString().slice(0, 10);
  }

  // Derived from actual DB state, not hardcoded — invoice_number is
  // globally unique, so this must never assume a fixed starting point
  // (that assumption is exactly what caused the P2002 collision on a
  // second run before this fix).
  const existingInvoiceNumbers = await prisma.invoice.findMany({ select: { invoiceNumber: true } });
  let invoiceCounter = existingInvoiceNumbers.reduce((max, inv) => {
    const match = /^INV-2026-(\d+)$/.exec(inv.invoiceNumber);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  function nextInvoiceNumber(): string {
    return `INV-2026-${String(invoiceCounter++).padStart(3, "0")}`;
  }

  // Matches src/lib/enums.ts COST_CATEGORY_SUGGESTIONS exactly, so the
  // Typeahead's suggestion list and the seeded data stay consistent.
  const COST_TEMPLATES = [
    { desc: "PNBP Pengecekan Sertifikat", category: "PNBP" },
    { desc: "BPHTB", category: "BPHTB" },
    { desc: "Honorarium Notaris", category: "Honorarium" },
    { desc: "Materai", category: "Materai" },
    { desc: "Biaya Pengecekan Sertifikat", category: "Pengecekan Sertifikat" },
    { desc: "Biaya Administrasi", category: "Biaya Administrasi" },
    { desc: "Pajak Penghasilan", category: "Pajak" },
    { desc: "Biaya Pengurusan Dokumen", category: "Lainnya" },
  ];
  const COST_AMOUNTS = [50000, 100000, 500000, 1500000, 5000000, 10000000, 25000000, 50000000];

  async function addCostDetails(staff: string, matterId: string, matterIdx: number, count: number) {
    for (let i = 0; i < count; i++) {
      const t = COST_TEMPLATES[(matterIdx + i) % COST_TEMPLATES.length];
      const amount = COST_AMOUNTS[(matterIdx * 2 + i) % COST_AMOUNTS.length];
      await call(createCostDetail, {
        staffName: staff, method: "POST",
        body: { matterId, costDate: nextDate(2), description: t.desc, category: t.category, amount },
      });
    }
  }

  interface MatterSpec { name: string; type: string }
  interface ClientSpec { name: string; type: "COMPANY" | "INDIVIDUAL"; matters: MatterSpec[] }

  // 11 new clients (6 corporate + 5 individual; combined with the 2 above
  // = 13 total, "10-15" per Step 3). All names fictional (Step 3/20).
  const NEW_CLIENTS: ClientSpec[] = [
    { name: "PT Arunika Properti", type: "COMPANY", matters: [
      { name: "AJB Ruko Bandung", type: "Akta Jual Beli" },
      { name: "Pendirian Anak Perusahaan", type: "Pendirian PT" },
      { name: "Perubahan Anggaran Dasar", type: "Perubahan Anggaran Dasar" },
    ] },
    { name: "PT Nusantara Karya Sentosa", type: "COMPANY", matters: [
      { name: "Pendirian PT", type: "Pendirian PT" },
      { name: "Perjanjian Kerja Sama Proyek", type: "Perjanjian" },
    ] },
    { name: "CV Bumi Persada", type: "COMPANY", matters: [
      { name: "AJB Gudang Cikarang", type: "Akta Jual Beli" },
      { name: "Akta Kuasa Pengurusan Izin", type: "Akta Kuasa" },
    ] },
    { name: "PT Sagara Investama", type: "COMPANY", matters: [
      { name: "Pengikatan Jual Beli Apartemen", type: "Pengikatan Jual Beli" },
      { name: "Perubahan Data Perseroan", type: "Perubahan Data Perseroan" },
    ] },
    { name: "PT Citra Mandiri Abadi", type: "COMPANY", matters: [
      { name: "Pendirian PT", type: "Pendirian PT" },
      { name: "AJB Ruko Sudirman", type: "Akta Jual Beli" },
    ] },
    { name: "PT Graha Sentosa Mandiri", type: "COMPANY", matters: [
      { name: "Perubahan Anggaran Dasar", type: "Perubahan Anggaran Dasar" },
    ] },
    { name: "Andi Pratama", type: "INDIVIDUAL", matters: [
      { name: "AJB Tanah Kavling", type: "Akta Jual Beli" },
      { name: "Akta Hibah Orang Tua", type: "Akta Hibah" },
    ] },
    { name: "Siti Rahmawati", type: "INDIVIDUAL", matters: [
      { name: "Akta Kuasa Jual", type: "Akta Kuasa" },
      { name: "Pengecekan Sertifikat Rumah", type: "Pengecekan Sertifikat" },
    ] },
    { name: "Dimas Wijaya", type: "INDIVIDUAL", matters: [
      { name: "AJB Rumah Tinggal", type: "Akta Jual Beli" },
    ] },
    { name: "Rina Maharani", type: "INDIVIDUAL", matters: [
      { name: "Akta Hibah Anak", type: "Akta Hibah" },
      { name: "Perjanjian Pra Nikah", type: "Perjanjian" },
    ] },
    { name: "Hendra Kusnadi", type: "INDIVIDUAL", matters: [
      { name: "Pengikatan Jual Beli Tanah", type: "Pengikatan Jual Beli" },
    ] },
  ];

  interface SeededMatter { clientId: string; clientName: string; matterId: string; matterName: string }

  // Wrapped in a function (rather than inline) so the resume path below
  // can skip straight to fetchExtendedDataset() instead of re-running
  // ~250 lines of creation calls when the extended dataset already exists.
  async function createExtendedDataset(): Promise<SeededMatter[]> {
  const allNewMatters: SeededMatter[] = [];
  const newClientIds: { id: string; name: string }[] = [];

  for (let ci = 0; ci < NEW_CLIENTS.length; ci++) {
    const spec = NEW_CLIENTS[ci];
    const staff = staffFor(ci);
    const clientRes = await call(createClient, {
      staffName: staff, method: "POST",
      body: {
        name: spec.name,
        clientType: spec.type,
        contactPhone: `0812-0000-${String(1000 + ci).slice(-4)}`,
        contactEmail: `${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@demo.example.local`,
      },
    });
    const clientId = clientRes.json.data.id;
    newClientIds.push({ id: clientId, name: spec.name });

    for (let mi = 0; mi < spec.matters.length; mi++) {
      const mspec = spec.matters[mi];
      const matterRes = await call(createMatter, {
        staffName: staff, method: "POST",
        body: { clientId, matterName: mspec.name, matterType: mspec.type, responsibleStaff: staff },
      });
      const matterId = matterRes.json.data.id;
      const globalIdx = allNewMatters.length;
      allNewMatters.push({ clientId, clientName: spec.name, matterId, matterName: mspec.name });
      await addCostDetails(staff, matterId, globalIdx, 2 + (globalIdx % 3)); // 2-4 cost details per matter
    }
  }

  // 3 extra matters on the two original (existing) clients, so those
  // clients also demonstrate "client with multiple matters" (Scenario 18).
  const extraMatterSpecs: { clientId: string; clientName: string; name: string; type: string }[] = [
    { clientId: client1Id, clientName: client1Name, name: "Perubahan Anggaran Dasar PT Nusantara", type: "Perubahan Anggaran Dasar" },
    { clientId: client1Id, clientName: client1Name, name: "Akta Kuasa Pengurusan Sertifikat", type: "Akta Kuasa" },
    { clientId: client2Id, clientName: client2Name, name: "Akta Hibah Tanah Warisan", type: "Akta Hibah" },
  ];
  for (let i = 0; i < extraMatterSpecs.length; i++) {
    const spec = extraMatterSpecs[i];
    const staff = staffFor(i);
    const matterRes = await call(createMatter, {
      staffName: staff, method: "POST",
      body: { clientId: spec.clientId, matterName: spec.name, matterType: spec.type, responsibleStaff: staff },
    });
    const matterId = matterRes.json.data.id;
    const globalIdx = allNewMatters.length;
    allNewMatters.push({ clientId: spec.clientId, clientName: spec.clientName, matterId, matterName: spec.name });
    await addCostDetails(staff, matterId, globalIdx, 2 + (globalIdx % 3));
  }

  console.log(`Created ${NEW_CLIENTS.length} new clients, ${allNewMatters.length} new matters.`);

  // ------------------------------------------------------------
  // 5 named partial-payment scenarios (Step 11, exact amounts)
  // ------------------------------------------------------------
  const namedScenarios: { label: string; matterIdx: number; total: number; allow: boolean; paid: number }[] = [
    { label: "Scenario A — allowed partial, NORMAL", matterIdx: 0, total: 20000000, allow: true, paid: 10000000 },
    { label: "Scenario B — disallowed partial, REVIEW_REQUIRED", matterIdx: 3, total: 20000000, allow: false, paid: 10000000 },
    { label: "Scenario C — allowed partial, larger invoice", matterIdx: 5, total: 50000000, allow: true, paid: 25000000 },
    { label: "Scenario D — disallowed partial, REVIEW_REQUIRED", matterIdx: 8, total: 30000000, allow: false, paid: 10000000 },
    { label: "Scenario E — allowed partial, near-full", matterIdx: 10, total: 100000000, allow: true, paid: 75000000 },
  ];
  for (let i = 0; i < namedScenarios.length; i++) {
    const sc = namedScenarios[i];
    const m = allNewMatters[sc.matterIdx];
    const staff = staffFor(i);
    const inv = await call(createInvoice, {
      staffName: staff, method: "POST",
      body: { matterId: m.matterId, invoiceNumber: nextInvoiceNumber(), invoiceDate: nextDate(3), totalAmount: sc.total, allowPartialPayment: sc.allow },
    });
    const txn = await call(createTransaction, {
      staffName: staff, method: "POST",
      body: { transactionDate: nextDate(4), amount: sc.paid, direction: "IN", matterId: m.matterId, description: `Transfer pembayaran invoice ${inv.json.data.invoiceNumber}`, sourceType: "BANK_STATEMENT", sourceReference: `BS-2026-${String(i + 1).padStart(2, "0")}-PARTIAL` },
    });
    const pay = await call(classifyTransaction, { staffName: staff, method: "POST", body: { financialType: "PAYMENT" }, params: { id: txn.json.data.id } });
    await call(allocatePayment, { staffName: staff, method: "POST", body: { invoiceId: inv.json.data.id, allocationType: "INVOICE_PAYMENT", amount: sc.paid }, params: { id: pay.json.data.id } });
    console.log(`  ${sc.label}: ${m.clientName} / ${m.matterName}`);
  }

  // ------------------------------------------------------------
  // Overpayment (Step 6/19 Scenario 4) — used sparingly, exactly once
  // ------------------------------------------------------------
  {
    const m = allNewMatters[12];
    const staff = staffFor(2);
    const inv = await call(createInvoice, {
      staffName: staff, method: "POST",
      body: { matterId: m.matterId, invoiceNumber: nextInvoiceNumber(), invoiceDate: nextDate(3), totalAmount: 10000000, allowPartialPayment: true },
    });
    const txn = await call(createTransaction, {
      staffName: staff, method: "POST",
      body: { transactionDate: nextDate(3), amount: 12000000, direction: "IN", matterId: m.matterId, description: `Transfer pembayaran invoice ${inv.json.data.invoiceNumber} (lebih dari tagihan)`, sourceType: "BANK_STATEMENT", sourceReference: "BS-2026-OVERPAY-01" },
    });
    const pay = await call(classifyTransaction, { staffName: staff, method: "POST", body: { financialType: "PAYMENT" }, params: { id: txn.json.data.id } });
    await call(allocatePayment, { staffName: staff, method: "POST", body: { invoiceId: inv.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 12000000 }, params: { id: pay.json.data.id } });
    console.log(`  Overpayment scenario: ${m.clientName} / ${m.matterName}`);
  }

  // ------------------------------------------------------------
  // Multi-invoice payment (Step 10, Scenario 7) — 2 dedicated matters
  // ------------------------------------------------------------
  const multiInvoiceMatterIdx = [1, 7];
  for (let mi = 0; mi < multiInvoiceMatterIdx.length; mi++) {
    const m = allNewMatters[multiInvoiceMatterIdx[mi]];
    const staff = staffFor(mi + 3);
    const invX = await call(createInvoice, { staffName: staff, method: "POST", body: { matterId: m.matterId, invoiceNumber: nextInvoiceNumber(), invoiceDate: nextDate(3), totalAmount: 10000000, allowPartialPayment: true } });
    const invY = await call(createInvoice, { staffName: staff, method: "POST", body: { matterId: m.matterId, invoiceNumber: nextInvoiceNumber(), invoiceDate: nextDate(2), totalAmount: 20000000, allowPartialPayment: true } });
    const txn = await call(createTransaction, {
      staffName: staff, method: "POST",
      body: { transactionDate: nextDate(4), amount: 30000000, direction: "IN", matterId: m.matterId, description: "Transfer pelunasan gabungan dua invoice", sourceType: "BANK_STATEMENT", sourceReference: `BS-2026-MULTI-${mi + 1}` },
    });
    const pay = await call(classifyTransaction, { staffName: staff, method: "POST", body: { financialType: "PAYMENT" }, params: { id: txn.json.data.id } });
    await call(allocatePayment, { staffName: staff, method: "POST", body: { invoiceId: invX.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 10000000 }, params: { id: pay.json.data.id } });
    await call(allocatePayment, { staffName: staff, method: "POST", body: { invoiceId: invY.json.data.id, allocationType: "INVOICE_PAYMENT", amount: 20000000 }, params: { id: pay.json.data.id } });
    console.log(`  Multi-invoice payment: ${m.clientName} / ${m.matterName}`);
  }

  // ------------------------------------------------------------
  // Generic invoices for the remaining matters — cycles PAID / UNPAID /
  // generic PARTIALLY_PAID / cost-only-no-invoice-yet, so not every
  // matter has an invoice (Step 6: "Tidak semua matter harus memiliki
  // invoice").
  // ------------------------------------------------------------
  const usedIdx = new Set([...namedScenarios.map((s) => s.matterIdx), 12, ...multiInvoiceMatterIdx]);
  const GENERIC_AMOUNTS = [8000000, 12000000, 18000000, 22000000, 35000000, 45000000];
  let genericCount = 0;
  for (let idx = 0; idx < allNewMatters.length; idx++) {
    if (usedIdx.has(idx)) continue;
    const m = allNewMatters[idx];
    const staff = staffFor(idx);
    const mode = genericCount % 4; // 0 PAID, 1 UNPAID, 2 PARTIALLY_PAID(normal), 3 no invoice
    genericCount++;
    if (mode === 3) continue; // realistic "still in progress, cost-only" matter

    const total = GENERIC_AMOUNTS[idx % GENERIC_AMOUNTS.length];
    const inv = await call(createInvoice, {
      staffName: staff, method: "POST",
      body: { matterId: m.matterId, invoiceNumber: nextInvoiceNumber(), invoiceDate: nextDate(3), totalAmount: total, allowPartialPayment: true },
    });
    if (mode === 1) continue; // UNPAID — invoice issued, no payment yet

    const paidAmount = mode === 0 ? total : Math.round((total * 0.5) / 100000) * 100000; // PAID or ~50% PARTIALLY_PAID
    const txn = await call(createTransaction, {
      staffName: staff, method: "POST",
      body: { transactionDate: nextDate(5), amount: paidAmount, direction: "IN", matterId: m.matterId, description: `Transfer pembayaran invoice ${inv.json.data.invoiceNumber}`, sourceType: "BANK_STATEMENT", sourceReference: `BS-2026-GEN-${String(idx).padStart(2, "0")}` },
    });
    const pay = await call(classifyTransaction, { staffName: staff, method: "POST", body: { financialType: "PAYMENT" }, params: { id: txn.json.data.id } });
    await call(allocatePayment, { staffName: staff, method: "POST", body: { invoiceId: inv.json.data.id, allocationType: "INVOICE_PAYMENT", amount: paidAmount }, params: { id: pay.json.data.id } });
  }

  // ------------------------------------------------------------
  // Fully unallocated payments (Step 9D, Scenario 8) — money received,
  // not yet matched to any invoice. Needed for
  // /payments?allocationStatus=UNALLOCATED.
  // ------------------------------------------------------------
  const unallocatedAmounts = [15000000, 6000000, 9500000, 3000000, 21000000, 4500000, 7000000, 11000000, 2500000];
  for (let i = 0; i < unallocatedAmounts.length; i++) {
    const m = allNewMatters[i % allNewMatters.length];
    const staff = staffFor(i);
    const txn = await call(createTransaction, {
      staffName: staff, method: "POST",
      body: { transactionDate: nextDate(3), amount: unallocatedAmounts[i], direction: "IN", matterId: m.matterId, description: "Transfer masuk — belum dialokasikan ke invoice", sourceType: "BANK_STATEMENT", sourceReference: `BS-2026-UNALLOC-${String(i + 1).padStart(2, "0")}` },
    });
    await call(classifyTransaction, { staffName: staff, method: "POST", body: { financialType: "PAYMENT" }, params: { id: txn.json.data.id } });
  }
  console.log(`  ${unallocatedAmounts.length} fully unallocated payments seeded.`);

  // ------------------------------------------------------------
  // Deposit / Disbursement variety (Step 12/13, Scenario 11/12/13)
  // ------------------------------------------------------------
  const depositMatterIdx = [0, 2, 5, 7, 10, 12, 15, 17, 20, allNewMatters.length - 2, allNewMatters.length - 1]
    .filter((v, i, arr) => arr.indexOf(v) === i && v < allNewMatters.length);
  for (let i = 0; i < depositMatterIdx.length; i++) {
    const m = allNewMatters[depositMatterIdx[i]];
    const staff = staffFor(i + 1);
    const flavor = i % 3; // 0 fully used, 1 partially used (2-3 disbursements), 2 untouched/remaining
    const depositAmount = [15000000, 20000000, 30000000, 8000000, 12000000][i % 5];

    const depTxn = await call(createTransaction, {
      staffName: staff, method: "POST",
      body: { transactionDate: nextDate(3), amount: depositAmount, direction: "IN", matterId: m.matterId, description: "Titipan biaya pengurusan", sourceType: "WHATSAPP", sourceReference: `WA-CONFIRM-${String(i + 1).padStart(3, "0")}` },
    });
    await call(classifyTransaction, { staffName: staff, method: "POST", body: { financialType: "DEPOSIT" }, params: { id: depTxn.json.data.id } });

    if (flavor === 0) {
      // fully used — one disbursement matching the deposit exactly
      const disTxn = await call(createTransaction, {
        staffName: staff, method: "POST",
        body: { transactionDate: nextDate(2), amount: depositAmount, direction: "OUT", matterId: m.matterId, description: "Pencairan biaya pengurusan (penuh)" },
      });
      await call(classifyTransaction, { staffName: staff, method: "POST", body: { financialType: "DISBURSEMENT", category: "Biaya Pihak Ketiga" }, params: { id: disTxn.json.data.id } });
    } else if (flavor === 1) {
      // partially used — 2-3 separate disbursements (realistic: BPHTB + PNBP + admin paid separately from the same pooled deposit)
      const parts = [{ pct: 0.3, cat: "BPHTB" }, { pct: 0.2, cat: "PNBP" }, { pct: 0.1, cat: "Administrasi" }];
      for (const part of parts) {
        const amt = Math.round((depositAmount * part.pct) / 50000) * 50000;
        const disTxn = await call(createTransaction, {
          staffName: staff, method: "POST",
          body: { transactionDate: nextDate(2), amount: amt, direction: "OUT", matterId: m.matterId, description: `Pencairan ${part.cat}` },
        });
        await call(classifyTransaction, { staffName: staff, method: "POST", body: { financialType: "DISBURSEMENT", category: part.cat }, params: { id: disTxn.json.data.id } });
      }
    }
    // flavor === 2: untouched — deposit remains fully available, no disbursement
  }
  console.log(`  ${depositMatterIdx.length} deposit/disbursement matters seeded (fully used / partially used / untouched mix).`);

  // ------------------------------------------------------------
  // Unlinked transactions (Step 8, WAJIB) — both flavors
  // ------------------------------------------------------------
  const fullyUnlinked = [
    { amount: 5500000, direction: "IN", desc: "Transfer masuk — konfirmasi client", source: "BANK_STATEMENT", ref: "BS-2026-UNLINK-01" },
    { amount: 2100000, direction: "OUT", desc: "Pengeluaran belum teridentifikasi", source: "MANUAL", ref: undefined },
    { amount: 8750000, direction: "IN", desc: "Transfer masuk, belum jelas untuk client/matter mana", source: "BANK_STATEMENT", ref: "BS-2026-UNLINK-02" },
    { amount: 1500000, direction: "IN", desc: "Setoran tunai belum dikonfirmasi", source: "MANUAL", ref: undefined },
    { amount: 3200000, direction: "OUT", desc: "Transfer keluar, tujuan belum jelas", source: "EXCEL", ref: "EXCEL-RECAP-JUL-2026" },
  ];
  for (let i = 0; i < fullyUnlinked.length; i++) {
    const t = fullyUnlinked[i];
    await call(createTransaction, {
      staffName: staffFor(i), method: "POST",
      body: { transactionDate: nextDate(3), amount: t.amount, direction: t.direction, description: t.desc, sourceType: t.source, sourceReference: t.ref },
    });
  }
  const partiallyLinked = newClientIds.slice(0, 5);
  for (let i = 0; i < partiallyLinked.length; i++) {
    const c = partiallyLinked[i];
    const txn = await call(createTransaction, {
      staffName: staffFor(i + 1), method: "POST",
      body: { transactionDate: nextDate(3), amount: 4000000 + i * 500000, direction: "IN", description: `Transfer masuk — kemungkinan dari ${c.name}, matter belum dikonfirmasi`, sourceType: "WHATSAPP", sourceReference: `WA-CONFIRM-CLIENT-${i + 1}` },
    });
    // Client known, matter unknown — Scenario 10 (Phase 2 §2.2)
    await call(linkTransaction, { staffName: staffFor(i + 1), method: "POST", body: { action: "LINK_CLIENT", clientId: c.id }, params: { id: txn.json.data.id } });
  }
  console.log(`  ${fullyUnlinked.length} fully unlinked + ${partiallyLinked.length} client-known/matter-unknown transactions seeded.`);

  // ------------------------------------------------------------
  // SOURCE_PENDING transactions (Step 15) — triggers WARNING per the
  // existing warn_on_missing_source rule (src/app/api/transactions/route.ts)
  // ------------------------------------------------------------
  const sourcePendingAmounts = [900000, 1750000, 620000, 3100000, 480000];
  for (let i = 0; i < sourcePendingAmounts.length; i++) {
    const m = allNewMatters[(i * 4) % allNewMatters.length];
    await call(createTransaction, {
      staffName: staffFor(i + 2), method: "POST",
      body: { transactionDate: nextDate(2), amount: sourcePendingAmounts[i], direction: "IN", matterId: i % 2 === 0 ? m.matterId : undefined, description: "Transfer masuk, sumber belum dikonfirmasi" },
      // sourceType intentionally omitted — API defaults to SOURCE_PENDING
    });
  }
  console.log(`  ${sourcePendingAmounts.length} SOURCE_PENDING transactions seeded.`);

  // ------------------------------------------------------------
  // Attachments (Step 16) — small placeholder files, not real documents.
  // Attached across transaction/invoice/cost-detail/matter so source
  // aggregation (P2.3/P2.4) has real data to show.
  // ------------------------------------------------------------
  async function attach(staff: string, fileName: string, fields: Record<string, string>) {
    const form = new FormData();
    form.set("file", new File([`Demo placeholder for ${fileName} — not a real document.`], fileName, { type: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg" }));
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    await call(attachFile, { staffName: staff, method: "POST", formData: form });
  }

  await attach(staffFor(0), "bukti-transfer-demo-001.pdf", { transactionId: payTxnId });
  await attach(staffFor(1), "invoice-demo-001.pdf", { invoiceId: invoiceAId });
  await attach(staffFor(2), "rincian-biaya-demo-001.pdf", { matterId: matterId1 });
  await attach(staffFor(0), "bank-statement-demo-001.pdf", { matterId: allNewMatters[0].matterId });
  await attach(staffFor(1), "bukti-transfer-demo-002.jpg", { matterId: allNewMatters[1].matterId });
  for (let i = 0; i < 6; i++) {
    await attach(staffFor(i), `bukti-transfer-demo-${String(i + 3).padStart(3, "0")}.pdf`, { matterId: allNewMatters[(i * 3) % allNewMatters.length].matterId });
  }
  console.log("  11 dummy attachments seeded (transaction/invoice/matter).");

  return allNewMatters;
  } // end createExtendedDataset()

  async function fetchExtendedDataset(): Promise<SeededMatter[]> {
    const newClientNames = NEW_CLIENTS.map((c) => c.name);
    const matters = await prisma.matter.findMany({
      where: { client: { name: { in: newClientNames } } },
      include: { client: { select: { id: true, name: true } } },
    });
    const extraMatterNames = ["Perubahan Anggaran Dasar PT Nusantara", "Akta Kuasa Pengurusan Sertifikat", "Akta Hibah Tanah Warisan"];
    const extraMatters = await prisma.matter.findMany({
      where: { matterName: { in: extraMatterNames } },
      include: { client: { select: { id: true, name: true } } },
    });
    return [...matters, ...extraMatters].map((m) => ({
      clientId: m.client.id, clientName: m.client.name, matterId: m.id, matterName: m.matterName,
    }));
  }

  const allNewMatters = extendedDatasetExists ? await fetchExtendedDataset() : await createExtendedDataset();

  // ------------------------------------------------------------
  // Small top-up so Payment count comfortably lands in the requested
  // 30-40 range (the scenario/generic loops above land at ~28) — its own
  // idempotency check (distinct sourceReference prefix) since this runs
  // after the main "PT Arunika Properti" guard already passed.
  // ------------------------------------------------------------
  const topUpMarker = await prisma.financialTransaction.findFirst({ where: { sourceReference: "BS-2026-TOPUP-01" } });
  if (!topUpMarker) {
    const topUpAmounts = [4200000, 6800000, 3100000, 9000000];
    for (let i = 0; i < topUpAmounts.length; i++) {
      const m = allNewMatters[(i * 7 + 2) % allNewMatters.length];
      const staff = staffFor(i + 2);
      const txn = await call(createTransaction, {
        staffName: staff, method: "POST",
        body: { transactionDate: nextDate(2), amount: topUpAmounts[i], direction: "IN", matterId: m.matterId, description: "Transfer masuk — belum dialokasikan ke invoice", sourceType: "BANK_STATEMENT", sourceReference: `BS-2026-TOPUP-${String(i + 1).padStart(2, "0")}` },
      });
      await call(classifyTransaction, { staffName: staff, method: "POST", body: { financialType: "PAYMENT" }, params: { id: txn.json.data.id } });
    }
    console.log(`  ${topUpAmounts.length} additional unallocated payments seeded (top-up).`);
  }

  const finalCounts = await prisma.$transaction([
    prisma.client.count(), prisma.matter.count(), prisma.costDetail.count(), prisma.invoice.count(),
    prisma.financialTransaction.count(), prisma.payment.count(), prisma.paymentAllocation.count(),
    prisma.deposit.count(), prisma.disbursement.count(), prisma.financialAttachment.count(), prisma.auditLog.count(),
  ]);
  console.log("Extended demo data seeded successfully. Totals in DB now:");
  console.log({
    clients: finalCounts[0], matters: finalCounts[1], costDetails: finalCounts[2], invoices: finalCounts[3],
    financialTransactions: finalCounts[4], payments: finalCounts[5], paymentAllocations: finalCounts[6],
    deposits: finalCounts[7], disbursements: finalCounts[8], attachments: finalCounts[9], auditLogs: finalCounts[10],
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
