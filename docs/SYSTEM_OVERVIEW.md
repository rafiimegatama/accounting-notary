# System Overview

Technical architecture reference. For product context read `../CLAUDE.md` and `PRD.md` first —
this document assumes you already know *what* the system is for and focuses on *how it's built*.

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js 14 (App Router) | Frontend (React) + backend (route handlers) in one process |
| Database | PostgreSQL 16 | Self-hosted, same machine as the app, not managed/cloud |
| ORM | Prisma 5 | `prisma/schema.prisma`; raw SQL for triggers/checks Prisma can't express (`ddl_notary_financial_control.sql`) |
| UI | Tailwind CSS v4 + `recharts` | Design tokens in `src/app/globals.css` `@theme`; shared components in `src/components/ui/` |
| Auth | Local: staff + scrypt-hashed PIN, HMAC-signed session cookie | `src/lib/session.ts`, `src/lib/currentUser.ts` — no role/permission system |
| Deployment | Docker Compose (app + Postgres) | `Dockerfile`, `docker-compose.yml` — one office server, LAN access |

## 2. Request Lifecycle

```
Browser (LAN) → Next.js middleware (cookie-presence check, Edge runtime)
             → Page (Server Component, calls requireSession() for real crypto verification)
             → Client interaction → fetch to /api/* route handler
             → getCurrentUser(request) — verifies signed session cookie server-side
             → withApiHandler(async () => { ... }) — catches ApiError, formats envelope
             → prisma.$transaction(async (tx) => {
                   mutate data
                   writeAuditLog(tx, {...})   // same transaction — atomic with the mutation
                 })
             → apiSuccess(data) / apiError(code, message)
```

Key point: **middleware only checks cookie presence** (Edge runtime can't do the real HMAC
verification the way session signing needs it). The actual cryptographic check happens in
`requireSession()` (pages) and `getCurrentUser()`/`getCurrentSession()` (API routes) — "frontend
hiding a button is not authorization" (`UI_IMPLEMENTATION_REPORT.md §5`).

## 3. Data Model Summary

12 tables — full definitions in `prisma/schema.prisma`, authoritative constraints/triggers in
`ddl_notary_financial_control.sql` (Prisma can't express `CHECK` constraints or triggers).

```
Client ──< Matter ──< Invoice ──< PaymentAllocation >── Payment ── FinancialTransaction
              │                                                          │
              ├──< CostDetail                                    also 1:1 with:
              │                                                   Deposit, Disbursement
              └──< FinancialAttachment (source docs)
Staff (auth only, no FK from financial tables)
AuditLog (entityType + entityId — polymorphic reference, not a hard FK, by design)
SystemSetting (exception-rule defaults)
```

**The core design decision**: `FinancialTransaction` is the immutable raw fact (amount, direction,
date — never editable, only voidable). `Payment` / `Deposit` / `Disbursement` are 1:1 business
*classifications* layered on top of a transaction, not separate financial facts. This is why there
is no separate "financial event" or "financial source" table — they'd duplicate what a classified
transaction already represents. See the decision register referenced in `MVP_SCOPE.md §5`.

## 4. Financial Position Formulas

Computed live in `src/lib/position.ts` — never stored/cached, always over `status: "ACTIVE"` rows:

- `totalCost` = Σ active `cost_detail.amount` for the matter
- `totalInvoice` = Σ `invoice.totalAmount` where `status = "ISSUED"`
- `outstanding` = Σ per-invoice `(totalAmount − allocated)`
- `totalPayment` = Σ transaction `amount` where `financialType = "PAYMENT"`
- `depositReceived` = Σ transaction `amount` where `financialType = "DEPOSIT"`
- `depositUsed` = Σ transaction `amount` where `financialType = "DISBURSEMENT"`
- `depositRemaining` = `depositReceived − depositUsed`

`totalCost` and `totalInvoice` are **intentionally independent** — nothing forces them to
reconcile (see the accountant Q&A captured in `CHANGELOG.md` v5). `totalPayment` and
`depositReceived` are also intentionally separate money pools: Payment settles an Invoice;
Deposit is client funds held for the matter, not office revenue, until disbursed.

## 5. Auth Model

- `staff` table: name + scrypt-hashed PIN. No roles — every authenticated staff member can perform
  every action (matches office size; a permission system was judged overengineering, see
  `UI_IMPLEMENTATION_REPORT.md §11`).
- Session: signed HMAC cookie, 12h TTL, verified server-side on every page and every API route.
- Lock screen: `sessionStorage`-based UI overlay requiring PIN re-entry. This is a shared-terminal
  convenience, **not** a second factor — the underlying session cookie stays valid while locked.
- This auth model assumes a trusted LAN. See `PROJECT_RULES.md §4` before ever exposing the app
  beyond LAN (public tunnel, port-forward, cloud deploy) — that changes the threat model entirely.

## 6. Deployment Topology

Single Docker Compose stack on one office PC/mini-server:

```
┌─────────────────────────────────────┐
│ Office server (Docker Compose)       │
│  ┌───────────┐      ┌──────────────┐ │
│  │ app:3000  │─────▶│ db:5432      │ │
│  │ (Next.js) │      │ (Postgres16) │ │
│  └───────────┘      └──────────────┘ │
│  attachments volume  db_data volume  │
└──────────────┬────────────────────────┘
               │ LAN only
      ┌────────┼────────┬─────────┐
   staff PC  staff PC  staff PC  ...
```

No cloud dependency for core operation. `db:5432` is internal to the Compose network only — not
published to the LAN (`docker-compose.yml` binds it to `127.0.0.1` on the host, for optional local
debugging). The server itself should be Ethernet-wired even when staff PCs are WiFi-only: it's the
one link every staff session depends on simultaneously (`DEPLOYMENT.md §9`). See `DEPLOYMENT.md`
for the full runbook.

## 7. Where to Go Deeper

| Question | Document |
|---|---|
| What features exist and why | `PRD.md`, `../MVP_SCOPE.md` |
| Is a specific constraint actually enforced in code/DB | `../SYSTEM_CONSISTENCY_REPORT.md` |
| What was built in the UI pass, what bugs were found | `../UI_IMPLEMENTATION_REPORT.md` |
| Folder-by-folder map | `REPOSITORY_STRUCTURE.md` |
| Coding conventions | `CODING_STANDARD.md` |
| How to run/deploy it | `DEPLOYMENT.md` |
