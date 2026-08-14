# Product Requirements Document — Notary Financial Control System

| | |
|---|---|
| Status | Living document — update in place, log material changes in [`CHANGELOG.md`](../CHANGELOG.md) |
| Owner | Solution Analyst role (see [`.claude/agents/planner-agent.md`](../.claude/agents/planner-agent.md) for how backlog items get scoped from this doc) |
| Related | [`../CLAUDE.md`](../CLAUDE.md) · [`../MVP_SCOPE.md`](../MVP_SCOPE.md) · [`SYSTEM_OVERVIEW.md`](SYSTEM_OVERVIEW.md) · [`ROADMAP.md`](ROADMAP.md) |

## 1. Executive Summary

The office's accounting staff do not lack accounting skill — they lack a single place to see a
client or matter's financial position without manually reconciling Excel, WhatsApp, bank
statements, Word documents, and paper cost breakdowns (*rincian biaya*). This system is a
**financial control and traceability layer** on top of that reality, not a replacement for any of
those sources and not a general ledger. It exists to make four questions answerable in seconds
instead of by manual cross-referencing: *Where did this money come from? Who does it belong to?
What's the current position? Where did this number originate?*

## 2. Background & Problem Statement

Discovery interviews with the office's accounting staff scored 20 pain areas 0–10 (full table in
[`CLAUDE.md §2`](../CLAUDE.md)). Two findings shaped every downstream decision:

1. **Areas scored 0/10** (bank reconciliation, duplicate payment detection, month-end closing,
   matching bank transactions to invoices) were explicitly *already working well*. The MVP was
   scoped to leave these alone — building "better" versions of a non-problem is waste, not value.
2. **Areas scored 8–10/10** — unclear payment ownership (10), financial position visibility (10),
   partial/irregular payments (8), transaction traceability (8) — became the entire MVP surface.

A critical correction surfaced mid-discovery: pain point #5 ("payment belum jelas client/matter")
was initially assumed to mean staff *want* the system to guess ownership. The actual quote was the
opposite — *"Kalau memang belum jelas milik siapa kita gaakan claim, sebelum orangnya yang
bilang."* ("If it's genuinely unclear who it belongs to, we won't claim it until the person says
so.") This is why **UNLINKED is a first-class, permanent-if-needed state**, not an error condition
to be resolved — see Constraint 2 in [`PROJECT_RULES.md`](PROJECT_RULES.md).

## 3. Goals

- Let staff record financial facts (transactions, costs, invoices) the moment they're known, even
  before it's clear which client/matter they belong to.
- Let staff link, reclassify, and correct that data over time without ever losing history.
- Answer "what's this client/matter's financial position?" as one screen with every number
  drillable to its source records.
- Make every transaction traceable end-to-end: source → transaction → classification → allocation
  → current status.
- Preserve a complete, tamper-evident audit trail for every mutation that matters.

## 4. Non-Goals

Restated from [`CLAUDE.md §4`](../CLAUDE.md) because scope creep is the single biggest risk to a
tool like this: full double-entry accounting / General Ledger replacement, complex Chart of
Accounts, payroll, tax calculation/filing, AI-autonomous payment matching or "auto-claim",
automatic WhatsApp ingestion, automatic bank-statement scraping, OCR pipelines, complex approval
workflow engines, multi-company ERP, procurement, inventory, full CRM, HR. If any of these becomes
a real need, it is scoped as a **separate initiative** and logged in [`ROADMAP.md`](ROADMAP.md) —
never silently folded into this system's surface area.

## 5. Users

| Persona | Role | Primary needs |
|---|---|---|
| Accounting staff | Daily user, multiple people, shared LAN access | Record transactions fast; link/classify without friction; find a client/matter's position and drill into it; understand *why* something is flagged for review |
| Notary (principal) | Occasional user / report consumer | High-level financial position per client/matter; trusts the numbers because they trace to source |
| Future: office admin | Not yet built | Manage staff accounts, exception-rule defaults (currently DB-only, see `UI_IMPLEMENTATION_REPORT.md §11`) |

No customer/client-facing persona exists or is planned — this is an internal tool only.

## 6. Core Workflow

```
COLLECT   Record a financial fact as soon as it's known — client/matter link is optional at entry.
LINK      UNLINKED → LINKED_TO_CLIENT → LINKED_TO_MATTER. Always manual, always reversible,
          always audit-logged. The system never guesses.
POSITION  Client/Matter Financial Position: Total Cost, Total Invoice, Total Payment, Deposit
          Received/Used/Remaining, Outstanding — every figure is a formula over live records,
          never a stored/cached number, and every figure drills down to its rows.
TRACE     From any entry point (transaction, payment, invoice, cost detail) walk forward/backward
          through the full chain of what happened to that money.
```

## 7. Functional Requirements

Requirements are grouped by module. Status reflects the codebase as of `v5` (see
[`../CHANGELOG.md`](../CHANGELOG.md)); new requirements accepted after this point belong in
[`ROADMAP.md`](ROADMAP.md) until implemented, then get moved here.

### 7.1 Client & Matter
- FR-1: Client and Matter are separate entities with stable UUID identity, never looked up by name. **[Done]**
- FR-2: A Matter always belongs to exactly one Client. **[Done]**

### 7.2 Financial Transaction (the immutable fact layer)
- FR-3: A transaction records amount, direction (IN/OUT), date, description, and source — client/matter
  link is optional at creation. **[Done]**
- FR-4: Once created, a transaction's amount/date/direction can never be edited — only voided with a
  reason, preserving full history. **[Done — by design, not a gap; see PROJECT_RULES.md Constraint 5]**
- FR-5: A transaction can be reclassified as PAYMENT, DEPOSIT, DISBURSEMENT, or left UNCLASSIFIED. **[Done]**

### 7.3 Invoice
- FR-6: An invoice belongs to exactly one Matter, with a manually-entered invoice number that must
  be unique. **[Done]**
- FR-7: Invoice payment status (UNPAID/PARTIALLY_PAID/PAID/OVERPAID) is derived from allocations,
  never stored. **[Done]**
- FR-8: `allow_partial_payment` is configurable per invoice, driving whether a partial payment is
  NORMAL or REVIEW_REQUIRED. **[Done]**
- FR-9: Invoice numbers should be sequential/predictable enough for staff to notice a gap.
  **[Done — v18. `GET /api/invoices?suggestNext=true` suggests the next `INV-{year}-{seq}` number
  (per-year reset, confirmed with the office); `POST /api/invoices` returns a non-blocking
  `sequenceWarning` if a manually-entered number breaks sequence. Manual override still fully
  allowed. See `CHANGELOG.md` v18.]**

### 7.4 Payment
- FR-10: A payment (money in, allocated toward one or more invoices) can be created and allocated
  across multiple invoices (many-to-many via Payment Allocation). **[Done]**
- FR-11: An allocation can be reversed (not deleted) with a reason, restoring the invoice's
  outstanding balance and recomputing review status — logged to the audit trail. **[Done]**
- FR-12: Staff need a way to correct a mis-entered payment without destroying its history.
  **[Done — v18. `POST /api/payments/[id]/correct` voids the original and creates the corrected
  replacement atomically (one `prisma.$transaction`), cross-linked in the audit trail and rendered
  as "Dikoreksi oleh"/"Mengoreksi" in Transaction Trace. Still void + re-enter under the hood (no
  in-place edit, by design, unchanged) — now one explicit staff action instead of two manual steps.
  See `CHANGELOG.md` v18.]**

### 7.5 Deposit & Disbursement
- FR-13: Deposits (client funds held for a matter, distinct from office revenue) and Disbursements
  (money paid out of that pool) are tracked per matter, with Deposit Remaining = Received − Used.
  **[Done]**
- FR-14: Disbursement has a free-text `category` field for what the money was used for. **[Done]**
- FR-15: Disbursement category should structurally capture which bank/account funded the
  disbursement, since staff currently track this on paper. **[Done — v18. New `BankAccount` lookup
  table (office confirmed a small, fixed set) + optional `Disbursement.bankAccountId`, additive to
  the existing free-text `category`. See `CHANGELOG.md` v18.]**

### 7.6 Cost Detail
- FR-16: Cost details (itemized expenses per matter — PNBP, BPHTB, Honorarium, Materai, etc.) are
  free-text categorized, summed into Total Cost. **[Done]**
- FR-17: Total Cost and Total Invoice are independent figures and are never forced to reconcile —
  an invoice may bundle costs plus markup, or be issued before all costs are recorded. **[Done —
  by design; see the accountant Q&A logged in `CHANGELOG.md` v5 discussion]**

### 7.7 Financial Position
- FR-18: Client/Matter Position screen shows Total Cost, Total Invoice, Outstanding, Total Payment,
  Unallocated Amount, Deposit Received/Used/Remaining — every number links to its underlying rows.
  **[Done — formulas in `src/lib/position.ts`]**

### 7.8 Traceability & Audit
- FR-19: Any entry point (transaction/payment/invoice/cost detail) supports a multi-hop trace to
  everything upstream/downstream of it. **[Done]**
- FR-20: Every mutation that changes meaningful state writes an audit log entry: who, when,
  previous value, new value, reason. **[Done — enforced by convention (`writeAuditLog`), verified
  by grep cross-check in `SYSTEM_CONSISTENCY_REPORT.md`]**
- FR-21: No financial record supports destructive delete at the database level. **[Done — DB
  triggers, not just application code]**

### 7.9 Search & Reports
- FR-22: Global search (incl. ⌘K) across clients/matters/transactions. **[Done]**
- FR-23: CSV export for transaction history. **[Done]**
- FR-24: Formal/printable report generation. **[Done — v25. Browser-native `window.print()` +
  print stylesheet on Client/Matter Financial Position (`PrintReportButton.tsx`), not a dedicated
  PDF report engine (still explicitly out of scope) — "Save as PDF" in the browser's own print
  dialog is the PDF path. Known gap: the printed header uses the branding *default* text, not the
  office's live-configured branding setting. See `CHANGELOG.md` v25.]**

### 7.10 Auth
- FR-25: Local-only auth: staff name + PIN, signed session cookie, no roles/permissions (every
  staff member can do everything). **[Done]**
- FR-26: Lock screen for shared terminals (UI convenience, not a second factor). **[Done]**

## 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Data integrity | Every financial fact is immutable once written; corrections are additive (void + re-enter), never overwrites. |
| Auditability | Every meaningful mutation is reconstructable: who, when, before/after, why. |
| Deployment | 100% on-premise/LAN — no data leaves the office network. No cloud dependency for core operation. |
| Availability | Single-office, single-server — no HA requirement. Docker Compose restart is an acceptable recovery path. |
| Security | Auth is proportionate to a shared-office terminal, not a public-internet-facing system (see `PROJECT_RULES.md` before ever exposing this beyond LAN). |
| Performance | No stated SLA — current volume is small (single office). Revisit indexing only if `MVP_SCOPE.md §12` volume unknowns materialize. |

## 9. Success Metrics

Qualitative, not instrumented (no analytics in scope):
- Staff can answer "what's this matter's financial position" without opening Excel/WhatsApp.
- Staff can explain where a flagged (REVIEW_REQUIRED/WARNING) transaction came from without asking
  a colleague.
- The notary trusts numbers shown because they can click through to source.

## 10. Open Questions (carried from MVP_SCOPE.md §12)

- Real taxonomy for `cost_detail`/`disbursement` categories (currently free text).
- Real Excel/bank-statement/rincian-biaya formats staff actually use (working hypothesis unvalidated).
- Whether one invoice ever needs to span multiple matters (currently 1:1).
- Real data volume — affects whether current indexing is sufficient long-term.

## 11. Near-Term Backlog

The three items raised directly by the office's accountant during the 2026-08-11 walkthrough —
sequential invoice numbering (FR-9), a clearer payment-correction workflow (FR-12), and structured
per-bank disbursement categorization (FR-15) — all shipped in `CHANGELOG.md` v18 and are marked
`[Done]` above. See [`ROADMAP.md`](ROADMAP.md) for whatever is currently next in priority order.

## 12. Change Control

This PRD is versioned by git history, not by a version number in the header. Material changes
(new/removed requirement, changed non-goal) must get a `CHANGELOG.md` entry. Cosmetic edits
(wording, links) don't need one.
