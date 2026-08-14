# Roadmap

Prioritized backlog. Items move to `PRD.md §7` (Functional Requirements) once implemented, with
status flipped to **[Done]** there and a `CHANGELOG.md` entry recorded. Nothing here is a
commitment with a date — this is a priority-ordered list, not a schedule.

## Near-Term — raised directly by office accounting staff (2026-08-11 walkthrough)

All three items originally listed here shipped in `CHANGELOG.md` v18 — see `PRD.md §7` (FR-9,
FR-12, FR-15) for their current `[Done]` status and what was actually built:

1. **Sequential invoice numbering** — resolved open question: per-year reset (`INV-2026-001`
   style), confirmed with the office before implementation.
2. **Clearer payment correction workflow** — `POST /api/payments/[id]/correct`.
3. **Structured per-bank disbursement categorization** — resolved open question: the office
   confirmed a small, fixed set of bank accounts, so this became a `BankAccount` lookup table
   (not structured free text).

## Mid-Term (from `MVP_SCOPE.md §12`/`§13` — not yet validated as real needs)

- Generic structured file import (CSV) — schema is already source-agnostic, but no parser exists
  pending a real sample file from the office.
- Full-text/trigram search if data volume grows enough that the current search becomes slow (no
  evidence yet that it does).
- VOID endpoint (exists in the API) wired into more of the UI (currently reachable from Transaction
  Trace / Matter Position; consider surfacing from more entry points if staff ask for it).
- Resolve the Document/Source aggregation gap (`UI_IMPLEMENTATION_REPORT.md §11`,
  `SYSTEM_CONSISTENCY_REPORT.md` check #1 WARNING): Matter/Client Position only shows attachments
  linked directly to the matter/client, not ones nested under its cost details/invoices/
  transactions. `/sources` partially mitigates this as a flat list but doesn't fix the Position
  screen itself.
- `GlobalSearch` "Enter jumps to top result" (raised, deliberately not implemented, in
  `CHANGELOG.md` v22): skipped because result priority across the 5 different result categories
  (Client/Matter/Invoice/Payment/Transaction) is genuinely ambiguous — needs an explicit ranking
  decision from the office, not a guess, before it's built.
- Extend "Recent Client/Matter" (`CHANGELOG.md` v24, `src/lib/recentSelections.ts`) to
  `BulkLinkPanel` (`src/components/BulkActionToolbar.tsx`, the Transactions page's bulk "Assign
  Client/Matter" panel) — a 3rd Client/Matter picker in the app, same `Typeahead` + Matter
  `<select>` pattern as the 2 call sites (`NewTransactionModal`, `LinkDrawer`) it already shipped
  on. Deliberately left out of v24 since that task was scoped to exactly those 2 named call sites,
  not a blanket IA extension.
- Fix `docker compose build app` — currently fails outright (`invalid file request
  backups/db/daily/notary_financial_control-latest.sql.gz`, found and reproduced during
  `CHANGELOG.md` v26 QA). Root cause: the `backup`/`attachments-backup` services added in v15
  populate `backups/db/{daily,last,monthly,weekly}/*-latest.sql.gz` as symlinks, which Docker's
  build context cannot resolve, and `.dockerignore` doesn't exclude `backups/` at all. Not fixed in
  v26 (out of scope for that change) — verification there used a directly-mounted container as a
  workaround instead. Likely fix: add `backups/` to `.dockerignore`.

## Explicitly Not on This Roadmap

Restated because it's the most common way a tool like this quietly turns into something it was
never supposed to be: full double-entry accounting/GL, complex Chart of Accounts, payroll, tax
filing, AI-autonomous payment matching, automatic WhatsApp/bank ingestion, OCR, approval workflow
engines, multi-company ERP, procurement, inventory, full CRM, HR. If a real need for one of these
emerges, it's a **separate initiative**, scoped and decided deliberately — not an item that
migrates onto this roadmap by default.
