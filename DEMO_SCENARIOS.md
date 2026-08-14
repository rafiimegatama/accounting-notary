# Demo Scenarios — Notary Financial Control System

**DEMO DATA ONLY — NOT FOR PRODUCTION.** All names are fictional (seeded by
`npx tsx scripts/seed-demo.ts`, PIN `1234` for any staff account). This guide is a manual
walkthrough script: 8 recommended stops that between them exercise every major workflow the
application supports. Run through it top to bottom for a first demo, or jump to whichever
scenario is relevant.

## 1. Unlinked incoming payment

**Where**: Dashboard → "Needs Attention" → **Unlinked Transactions**, or `/transactions?linked=unlinked`.

**What to click**: Open any row with Client/Matter shown as `-`. Click **Link** on the transaction
detail page.

**Expected behavior**: The Link drawer shows Client and Matter as two separate "Belum
teridentifikasi" fields — not one combined message. You can search and pick a client, or close
via **Selesaikan nanti** without being forced to resolve it now. This is intentional: unlinked is
a valid, permanent-if-needed state, not an error (pain point #5, scored 10/10 in the original
discovery interviews).

## 2. Partial invoice payment — allowed vs. not allowed

**Where**: `/invoices`, search for `INV-2026-004` and `INV-2026-005`.

- **INV-2026-004** (PT Arunika Properti / AJB Ruko Bandung) — Rp20.000.000 total, Rp10.000.000
  paid, `allow_partial_payment = true`. Status badge: **Partially Paid**, transaction review status
  stays **Normal** — the invoice detail page explains why in plain language.
- **INV-2026-005** (PT Nusantara Karya Sentosa / Pendirian PT) — same amounts, but
  `allow_partial_payment = false`. Same **Partially Paid** badge, but the underlying transaction is
  **Review Required**, with an explanation and a suggested action ("Tinjau apakah partial payment
  ini disengaja...").

## 3. One payment across multiple invoices

**Where**: PT Arunika Properti → matter **Pendirian Anak Perusahaan**.

**What to click**: Open the matter, scroll to Invoices — two invoices (Rp10jt, Rp20jt) — then open
the Payment row. The Payment detail's Allocations table shows both invoices, Rp30.000.000 total
allocated across them, Unallocated = Rp0.

## 4. Client financial position

**Where**: Clients → **PT Nusantara Properti** (the original seed client — richest single-client
story: 3 matters, cost details, invoices, a deposit/disbursement pair, and a relink correction).

**What to click**: Every summary tile (Total Cost, Total Invoice, Outstanding, Deposit Remaining...)
is clickable — it scrolls to the underlying table. Note the formula captions under the summary
row ("Outstanding = Total Invoice − Allocated (...) = ...") — those numbers are computed by the
backend, the caption just displays the same figures already shown elsewhere on the page.

## 5. Matter cost breakdown

**Where**: PT Nusantara Properti → matter **Akta Jual Beli Tanah Kavling No. 12**.

**What to click**: Scroll to Cost Detail — 4 line items (PNBP, BPHTB, Honorarium, Materai) with a
**TOTAL** row at the bottom (Rp40.530.000) matching the "Total Cost" summary tile above it exactly.

## 6. Deposit with a remaining balance

**Where**: PT Arunika Properti → matter **Perubahan Anggaran Dasar**.

**What to click**: Scroll to Deposit / Funds. This matter received a deposit that was only
partially disbursed (BPHTB + PNBP + Administrasi paid out of it) — the header line shows Received
/ Used / Remaining, and the Deposit Remaining formula caption breaks down the exact subtraction.
For a deposit that's **fully untouched** (100% remaining), see CV Bumi Persada / AJB Gudang
Cikarang instead.

## 7. Transaction trace ("what is this money, really?")

**Where**: PT Nusantara Properti → matter → find the transaction described *"Contoh transaksi yang
salah link lalu dikoreksi"* (or reach it via Search).

**What to click**: Open the transaction detail. The Timeline shows **Created → Linked → Relinked**
(the relink includes a reason: "Salah pilih matter saat input awal") — the previous matter is
still visible in the audit history even though the transaction is now linked elsewhere. This is
the answer to "uang ini sebenarnya apa, dan kenapa sekarang di sini?" from a single screen.

## 8. Review Required — two different reasons

**Where**: `/review`.

- **Disallowed partial payment**: `INV-2026-005` / `INV-2026-007` (Pendirian PT / Perubahan Data
  Perseroan) — partial payment on an invoice that doesn't allow it.
- **Overpayment**: `INV-2026-009` (Andi Pratama / AJB Tanah Kavling) — invoice Rp10.000.000, payment
  Rp12.000.000. The Reason column explains *why*, and a suggested-action line explains *what to do*
  — both computed deterministically from the existing exception rules, not written by hand for
  this specific record.

## Also worth a quick look

- **Bulk actions** (`/transactions`): select several rows via checkbox, use the toolbar to
  bulk-assign a client/matter or bulk-classify — each still goes through the same single-item
  `/link`/`/classify` endpoints and audit logging under the hood, just looped.
- **Source Pending** (Dashboard → Needs Attention → Source Pending, or
  `/transactions?sourceType=SOURCE_PENDING`): transactions recorded without a confirmed source —
  shown as a Warning, never blocking.
- **Sources & Documents** on any of the seeded matters/clients: aggregates attachments from the
  matter itself plus its cost details/invoices/transactions, each tagged with where it came from.
