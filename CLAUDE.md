# CLAUDE.md — Notary Financial Control System

Baca file ini terlebih dahulu sebelum melakukan perubahan apapun pada project ini.

## 1. Product Context

Software LOCAL untuk membantu finance/accounting di kantor notaris.

**BUKAN**: general-purpose accounting software, ERP, pengganti software accounting
yang sudah dipakai kantor, full General Ledger, tax filing platform, payroll,
CRM, atau AI accounting assistant.

**Tujuan**: NOTARY FINANCIAL CONTROL & TRACEABILITY SYSTEM.

Core workflow:

```
COLLECT → LINK → POSITION → TRACE
```

- **COLLECT** — Informasi finansialnya ada di mana?
- **LINK** — Informasi ini terkait Client/Matter yang mana?
- **POSITION** — Sekarang posisi finansial Client/Matter ini bagaimana?
- **TRACE** — Dari mana angka/transaksi ini berasal dan apa yang terjadi setelahnya?

Jika suatu fitur tidak membantu menjawab salah satu dari 4 pertanyaan di atas,
jangan masukkan ke MVP tanpa alasan jelas.

## 2. Discovery Findings (validated pain points)

Pain scale 0–10, dari staf accounting kantor notaris:

| # | Pain area | Score | Catatan |
|---|---|---|---|
| 1 | Uang masuk terkait client/matter | 0 | |
| 2 | Bedakan pendapatan kantor vs uang titipan | 0 | |
| 3 | Saldo uang titipan | 3 | |
| 4 | Cocokkan bank transaction vs invoice/payment | 0 | |
| 5 | Payment belum jelas client/matter | 10 | **Tapi**: "Kalau memang belum jelas milik siapa kita gaakan claim, sebelum orangnya yang bilang." → sistem TIDAK boleh memaksa identifikasi. UNLINKED = valid state. |
| 6 | Satu payment untuk beberapa invoice | 5 | |
| 7 | Partial/irregular payment | 8 | Partial sesuai struktur invoice = bukan masalah. Pain muncul saat payment TIDAK sesuai expected structure. |
| 8 | Invoice outstanding | 3 | |
| 9 | Tracking penggunaan uang titipan | 3 | |
| 10 | Tracking payment pihak ketiga | 3 | |
| 11 | Mencari bukti transaksi | 0 | |
| 12 | Riwayat lengkap transaction | 3 | |
| 13 | Duplicate payment | 0 | |
| 14 | Nominal/client/transaksi benar | 0 | |
| 15 | Posisi finansial client/matter | 10 | "biasanya buka rincian biayanya." → butuh consolidated view + drill-down ke cost detail. |
| 16 | Bank reconciliation | 0 | |
| 17 | Month-end closing | 0 | |
| 18 | Transaksi tidak tertinggal | 3 | |
| 19 | Laporan untuk notaris | 3 | |
| 20 | Menelusuri kembali transaksi | 8 | "dari rincian biaya juga." |

**Highest-value features**: unlinked payment handling (non-forced), consolidated
financial position per client/matter, cost-detail drill-down, transaction trace.

## 3. Current Source of Information (unstructured, do not assume format)

Excel, WhatsApp, bank statement, Word, rincian biaya, dokumen pendukung lain.

Jangan integrasi otomatis ke sumber-sumber ini. Gunakan konsep
SOURCE_REFERENCE / ATTACHMENT / MANUAL ENTRY. WhatsApp tidak boleh jadi database —
hanya SOURCE_TYPE = WHATSAPP dengan attachment (screenshot/export) jika perlu.

## 4. Non-Goals / Out of Scope

Full double-entry accounting engine, GL replacement, complex Chart of Accounts,
payroll, tax calculation/filing, AI autonomous decision/payment allocation,
automatic WhatsApp ingestion, automatic bank scraping, OCR pipeline (belum
diperlukan), complex approval workflow engine, multi-company ERP, procurement,
inventory, CRM penuh, HR.

Jika kebutuhan ini muncul saat development: catat di FUTURE / OUT OF SCOPE,
jangan langsung implementasikan.

## 5. Core Principle

Software membantu accounting staff TANPA mengubah proses yang sudah berjalan baik
(pain 0/10 = preserve, jangan diganti). Financial visibility & traceability =
yang harus DITINGKATKAN.

## 6. Tech Stack

- **Framework**: Next.js (App Router) — frontend (React) + backend (API routes) dalam satu app. Dijalankan sebagai satu server process di satu PC/mini-server kantor.
- **Database**: PostgreSQL — dihosting LOCAL di mesin server yang sama (bukan cloud, bukan managed service). **Direvisi dari SQLite** setelah deployment scope dikonfirmasi (lihat Riwayat Perubahan v1).
- **ORM**: Prisma.
- **Deployment model**: Satu server (Next.js + PostgreSQL) di satu PC/mini-server kantor. Staf accounting lain mengakses via browser ke IP server tersebut dalam jaringan LAN yang sama — bukan cloud, bukan multi-lokasi.
- **Attachment storage**: file disimpan di filesystem server yang sama (path tersimpan di DB), diakses semua staf melalui aplikasi — bukan network file share langsung.
- **Rationale**: proyek ini adalah software LOCAL untuk satu kantor notaris, diakses beberapa staf accounting sekaligus dari komputer berbeda (LAN, dikonfirmasi user). PostgreSQL dipilih karena didesain untuk concurrent multi-client write, sementara tetap 100% on-premise sesuai prinsip "software LOCAL" — tidak ada data yang keluar dari jaringan kantor.
- **Menjalankan (dev maupun deployment kantor)**: `docker compose up -d` — `Dockerfile` + `docker-compose.yml` membungkus app + PostgreSQL jadi satu, tidak perlu install Node/Postgres di mesin manapun selain Docker. Ini juga cara yang dipakai untuk menjalankan test scenario (Step 20) karena sandbox development tidak selalu punya Postgres terinstal.
- **UI**: Tailwind CSS v4 (`src/app/globals.css`, token warna di `@theme`) + `recharts` untuk chart Dashboard. Komponen shared di `src/components/ui/`.
- **Auth**: minimal local — tabel `staff` (nama + PIN ter-hash scrypt), session cookie signed HMAC (`src/lib/session.ts`), bukan sistem role/permission. Lihat Riwayat Perubahan v4 dan `UI_IMPLEMENTATION_REPORT.md` §5 untuk detail.
- **Demo data**: `npm run seed:demo` — seed lewat route handler asli (bukan raw SQL), jadi audit trail & review-status ikut ter-generate sesuai business logic sungguhan. Staf demo: PIN `1234`.

## 7. Key Design Constraints (dari master prompt, wajib dipatuhi)

1. Client/Matter harus pakai stable ID, bukan nama sebagai identifier.
2. Financial transaction TIDAK BOLEH dipaksa punya Client/Matter — UNLINKED adalah valid, permanent-if-needed state.
3. Tidak ada "auto claim" / AI automatic matching terhadap client/matter/invoice.
4. Setiap financial summary/angka harus traceable ke underlying record (clickable drill-down).
5. Financial record tidak boleh destructive delete — pakai adjustment/reversal/audit trail.
6. Reuse entity yang sudah ada sebelum membuat entity baru dengan fungsi serupa.
7. Business rule (mis. partial payment normal vs review-required) harus configurable, bukan hardcoded jadi "error".
8. Semua mutation penting (link/unlink/allocate/adjust) punya audit trail: user, timestamp, previous value, new value, reason.

## 8. Riwayat Perubahan

Tabel di bawah adalah **working memory ringkas untuk AI agent** (di-baca otomatis tiap sesi).
Changelog lengkap & human-readable ada di [`CHANGELOG.md`](CHANGELOG.md) — **itu adalah source of
truth**. Setiap kali menambah baris di sini, tambahkan juga entry yang lebih detail di
`CHANGELOG.md` (tulis di sana dulu, baru ringkas satu baris ke sini).

| Versi | Tanggal | Perubahan | File | Keterangan |
|---|---|---|---|---|
| v0 | 2026-08-10 | Inisialisasi project | CLAUDE.md | Project dimulai dari kosong (greenfield). Stack dikonfirmasi: Next.js + SQLite + Prisma. |
| v1 | 2026-08-10 | Revisi stack: SQLite → PostgreSQL | CLAUDE.md | Deployment scope dikonfirmasi user: multi-user LAN (beberapa staf accounting akses bersamaan dari komputer berbeda). SQLite berisiko untuk concurrent write lintas mesin. Database diganti PostgreSQL, tetap 100% on-premise/lokal di satu server kantor. Next.js + Prisma tidak berubah. |
| v2 | 2026-08-10 | Tambah Docker Compose | Dockerfile, docker-compose.yml, CLAUDE.md | User minta cara jalanin sistem tanpa install PostgreSQL/Node lokal. Dipakai juga untuk benar-benar menjalankan 14 skenario testing di Step 20 (sandbox awal tidak punya Postgres terinstal dan tidak ada akses sudo). |
| v3 | 2026-08-10 | MVP build lengkap (Step 1-22) selesai | seluruh src/, prisma/, MVP_SCOPE.md, SYSTEM_CONSISTENCY_REPORT.md | Step 21 menemukan 5 halaman nav yang belum pernah dibangun (`/`, `/clients`, `/transactions`, `/cost-details`, `/reports`) — ditutup. Step 22 menemukan 1 gap audit trail nyata (`recomputeReviewStatus` mengubah status otomatis tanpa log) — diperbaiki, dibuktikan test baru. Final: 9/9 MUST HAVE terbangun+teruji, 14/15 consistency check PASS, 1 WARNING (Document/Source aggregation belum lengkap, sudah dikenal & dilabeli jujur di UI), 0 FAIL. |
| v4 | 2026-08-10 | Complete UI + Application Integration | seluruh src/app, src/components, prisma (Staff table), UI_IMPLEMENTATION_REPORT.md | Built Notary Financial Control application berdasarkan Phase 1–22 functional contract: Tailwind design system, minimal local auth (staff+PIN, session cookie, lock screen), app shell (sidebar+header+⌘K search), 20 halaman (6 baru: Invoices/Payments/Deposits/Disbursements/Sources/Audit Log/Settings), 10 API endpoint baru. Menemukan & memperbaiki: audit trail gap yang sama seperti v3 tapi kali ini di call site `allocate`/`reverse` (regression test ditambah), 18 GET route yang belum enforce auth, `/api/auth/staff` yang ke-cache statis saat build (bug produksi nyata, ditemukan saat QA manual), Suspense boundary hilang di `/login`. Demo seed data ditambahkan (`npm run seed:demo`). Build/lint/typecheck/test semua PASS (23/23 test). Lihat UI_IMPLEMENTATION_REPORT.md untuk detail lengkap. |
| v5 | 2026-08-11 | Docker/Prisma fix, GitHub push, dokumentasi | Dockerfile, README.md, CHANGELOG.md | `node:20-alpine` tidak punya OpenSSL sehingga Prisma migration engine gagal total di container (`prisma migrate deploy` error) — diperbaiki dengan `apk add openssl` di stage `builder` dan `runner`. Diverifikasi lewat rebuild penuh dari nol (`build --no-cache` → `up -d` → `migrate deploy` → `seed:demo`) terhadap volume Postgres baru. Repo di-push ke GitHub (`rafiimegatama/accounting-notary`). README.md dan CHANGELOG.md ditambahkan; tabel ini sejak v5 jadi ringkasan, `CHANGELOG.md` adalah source of truth. |

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
rtk uv run <cmd>        # Compact uv project command output
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->