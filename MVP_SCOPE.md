# MVP Scope — Notary Financial Control System

Status: built and tested (Steps 1–20 of the master implementation prompt). This document is the
consolidated scope reference — see `CLAUDE.md` for ongoing project memory and change history.

## 1. Problem Statement

Kantor notaris ini **bukan** kekurangan kemampuan akuntansi. Masalahnya: informasi finansial suatu
client/matter tersebar di beberapa tempat (Excel, WhatsApp, bank statement, Word, rincian biaya),
sehingga untuk mengetahui posisi finansial atau menelusuri satu transaksi, staf harus membuka dan
menggabungkan beberapa sumber secara manual.

Software ini adalah **NOTARY FINANCIAL CONTROL & TRACEABILITY SYSTEM** — bukan general accounting
software, bukan ERP, bukan pengganti software akuntansi yang sudah dipakai kantor. Tujuannya membuat
informasi yang sudah diketahui/dikonfirmasi dapat dikumpulkan, dikaitkan, dilihat posisinya, dan
ditelusuri — mengikuti alur `COLLECT → LINK → POSITION → TRACE`.

## 2. Discovery Evidence

Berdasarkan interview dengan staf accounting kantor notaris, 20 area pain di-skor 0–10 (lihat
CLAUDE.md §2 untuk tabel lengkap). Temuan kunci:

- Area dengan pain **0/10** (mencocokkan bank transaction, bank reconciliation, month-end closing,
  duplicate payment, dsb.) menandakan proses yang **sudah berjalan baik** — sengaja tidak diubah.
- Area dengan pain **tertinggi** (payment belum jelas pemiliknya = 10/10, posisi finansial client/matter
  = 10/10, partial/irregular payment = 8/10, menelusuri kembali transaksi = 8/10) menjadi fokus utama MVP.
- Follow-up interview mengoreksi asumsi awal: "Kalau memang belum jelas milik siapa kita gaakan claim,
  sebelum orangnya yang bilang." — pain #5 bukan tentang *memaksa* identifikasi, tapi tentang *tidak
  memaksa* sistem mengarang kepemilikan.

## 3. Validated Pain Points → Fitur

| Pain point (score) | Fitur MVP yang menjawab |
|---|---|
| Payment belum jelas client/matter (10/10) | UNLINKED sebagai valid permanent state (Step 5/6/16) |
| Posisi finansial client/matter (10/10) | Financial Position screen, semua angka clickable (Step 7/15) |
| Partial/irregular payment (8/10) | `allow_partial_payment` per invoice, NORMAL vs REVIEW_REQUIRED (Step 9) |
| Menelusuri kembali transaksi (8/10), termasuk "dari rincian biaya juga" | Transaction Trace multi-entry (Step 8/17) |
| Satu payment untuk beberapa invoice (5/10) | PAYMENT_ALLOCATION many-to-many (Step 4/13) |
| Saldo/penggunaan uang titipan (3/10) | DEPOSIT/DISBURSEMENT tracking per matter (Step 7) |
| Riwayat lengkap transaksi (3/10) | AUDIT_LOG + Timeline (Step 17/19) |

## 4. Core Workflow

```
COLLECT   → Manual entry, financial_type/client/matter opsional saat input (Step 5)
LINK      → UNLINKED → LINKED_TO_CLIENT → LINKED_TO_MATTER, semua reversible dengan audit trail (Step 6)
POSITION  → Client/Matter Financial Position, formula eksplisit, semua drillable (Step 7/15)
TRACE     → Multi-entry (transaction/payment/invoice/cost detail), graph + timeline (Step 8/17)
```

## 5. Data Model (ringkasan — lihat `ddl_notary_financial_control.sql` untuk detail)

11 tabel: `client`, `matter`, `invoice`, `cost_detail`, `financial_transaction`, `payment`, `deposit`,
`disbursement`, `payment_allocation`, `financial_attachment`, `audit_log`, plus `system_setting`.

Prinsip kunci: `financial_transaction` adalah fakta mentah immutable (amount/date/direction tidak bisa
diubah, hanya di-VOID); `payment`/`deposit`/`disbursement` adalah klasifikasi bisnis 1:1 di atasnya;
tidak ada `CLIENT_FINANCIAL_POSITION` atau `FINANCIAL_EVENT` sebagai tabel fisik — keduanya derived
dari data yang sudah ada (lihat Step 4 decision register untuk alasan anti-duplikasi).

## 6. Screens (Step 14 IA)

| Route | Status |
|---|---|
| `/` Dashboard | ✅ dibangun |
| `/clients`, `/clients/[id]` | ✅ dibangun |
| `/matters/[id]` | ✅ dibangun (tidak ada `/matters` index — matter selalu diakses via client atau search) |
| `/transactions`, `/transactions/[id]` | ✅ dibangun |
| `/cost-details` | ✅ dibangun |
| `/review` (Unlinked/Review) | ✅ dibangun |
| `/search` | ✅ dibangun |
| `/reports` | ⚠️ placeholder jujur — konten NICE-TO-HAVE, belum dibangun |

## 7. APIs (Step 13/19 — lihat kode untuk daftar lengkap)

23 route: CRUD untuk client/matter/invoice/cost-detail/transaction, link/classify/void untuk transaction,
allocate/reverse untuk payment allocation, attachment upload+query, trace multi-entry, search, exception
queue. Semua pakai stable UUID sebagai identifier (tidak pernah nama). Standard response envelope
`{success, data, message, timestamp}` / `{success:false, errorCode, message, timestamp}`.

## 8. MUST HAVE — status

| # | Item | Status |
|---|---|---|
| 1 | Client/Matter financial position | ✅ Step 7/15, teruji (Scenario 4/6/11) |
| 2 | Cost detail | ✅ Step 13/15, teruji (Scenario 6) |
| 3 | Financial transaction | ✅ Step 13, teruji (Scenario 1/14) |
| 4 | Link financial data → Client/Matter | ✅ Step 6/13/16, teruji (Scenario 2/3/13) |
| 5 | Transaction traceability | ✅ Step 8/17, teruji (Scenario 9/10/12) |
| 6 | Source/reference | ✅ Step 10, teruji (Scenario 12) |
| 7 | Search | ✅ Step 18, teruji (Scenario 10) |
| 8 | Audit trail | ✅ Step 19, teruji (Scenario 13) |
| 9 | Unlinked transaction handling | ✅ Step 6/16, teruji (Scenario 1/14) |

Semua 9 item MUST HAVE terbangun **dan** diverifikasi lewat 14 skenario nyata (Step 20) terhadap
PostgreSQL sungguhan, plus `npm run build` sukses dan manual smoke-test lewat `npm start`.

## 9. NICE TO HAVE (belum dibangun, sengaja ditunda)

- Import Excel / CSV / bank statement — schema sudah source-agnostic (mendukung tanpa redesign), tapi
  parser format-spesifik butuh contoh file riil dulu (lihat Unknowns).
- Advanced filtering (selain yang sudah ada di `/transactions`, `/review`, `/search`).
- Export / cetak laporan formal (`/reports` masih placeholder).
- Attachment preview inline (saat ini hanya link download/nama file).

## 10. Explicitly Out of Scope

Full double-entry accounting engine, General Ledger replacement, Chart of Accounts kompleks, payroll,
tax calculation/filing, AI autonomous financial decision/payment matching, integrasi otomatis ke
WhatsApp, bank statement scraping otomatis, OCR pipeline, complex approval workflow engine,
multi-company ERP, procurement, inventory, CRM penuh, HR system. Jika kebutuhan ini muncul di masa
depan, didesain sebagai *initiative terpisah*, bukan ditambahkan ke sistem ini secara diam-diam.

## 11. Assumptions (kumpulan dari seluruh decision register Step 4–20)

- Single-currency (IDR implisit), tidak ada kolom currency.
- Satu invoice terikat satu matter (bukan multi-matter retainer).
- Disbursement diasumsikan selalu didanai dari deposit matter yang sama (pooled ledger, bukan FK
  spesifik ke deposit tertentu).
- Identitas staf via header `x-staff-name` pilihan sendiri (tanpa password) — identifikasi untuk audit
  trail, **bukan** access control.
- Deployment: satu server (Docker Compose: Next.js + PostgreSQL) di kantor, diakses staf via LAN.
- `allow_partial_payment` per invoice (boolean sederhana) dianggap cukup untuk membedakan partial
  payment yang NORMAL vs yang REVIEW_REQUIRED.

## 12. Unknowns (butuh validasi lanjutan sebelum dikembangkan lebih jauh)

- Struktur/taksonomi kategori `cost_detail` dan `disbursement` (biaya notaris, PNBP, BPHTB, materai,
  dst.) — saat ini free text.
- Format riil Excel/bank statement/rincian biaya yang dipakai staf — working hypothesis di Step 5 belum
  divalidasi dengan contoh file sungguhan.
- Apakah satu invoice pernah perlu mencakup beberapa matter (retainer bulanan lintas-matter).
- Kriteria pasti "incomplete cost detail" (Step 9 exception #8) — belum ada definisi konkret.
- Volume data riil (jumlah client/matter/transaksi per tahun) — memengaruhi apakah index yang ada
  (Step 12) cukup, atau perlu index tambahan/partitioning nanti.
- Aggregasi attachment lintas cost-detail/invoice/transaction di level Matter/Client (Step 14 gap note)
  — saat ini Document/Source section hanya menampilkan attachment yang nempel langsung ke matter/client.

## 13. Future Possibilities (bukan komitmen, hanya dicatat)

- Generic structured file import (CSV yang kolomnya sudah cocok skema) begitu format riil diketahui.
- Endpoint VOID (Step 19) yang sudah ada di backend belum disambungkan ke UI — bisa ditambahkan ke
  Transaction Trace / Matter Position screen.
- Full-text/trigram search index kalau volume data client/matter membesar signifikan.
