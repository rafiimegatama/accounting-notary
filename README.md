# Notary Financial Control System

A **local, LAN-only financial control & traceability system** for a notary office — not general
accounting software, not an ERP, and not a replacement for whatever accounting software the office
already uses.

> Internal / proprietary project. Not licensed for redistribution.

## The problem this solves

The office isn't short on accounting capability. The problem is that financial information about a
given client/matter is scattered across Excel, WhatsApp, bank statements, Word documents, and
handwritten cost breakdowns (*rincian biaya*) — so answering "what's the financial position of this
matter?" or "where did this transaction come from?" means manually opening and cross-referencing
several sources.

This system exists to answer four questions, and nothing else:

```
COLLECT   →  Where does this financial information live?
LINK      →  Which client/matter does it belong to?
POSITION  →  What is this client/matter's financial position right now?
TRACE     →  Where did this number come from, and what happened to it since?
```

Validated pain points from staff interviews (full scoring in [`CLAUDE.md`](CLAUDE.md)) drove the
MVP scope: unclaimed/**unlinked** payments must be a valid, non-forced permanent state; partial and
irregular payments need a NORMAL vs. REVIEW_REQUIRED distinction instead of being flagged as errors;
and every number shown must be click-through traceable to the record it came from.

## What this is *not*

Full double-entry accounting / General Ledger, complex Chart of Accounts, payroll, tax filing, AI
autonomous payment matching, automatic WhatsApp ingestion or bank-statement scraping, OCR, a
multi-company ERP, procurement, inventory, or a full CRM/HR system. See
[`MVP_SCOPE.md §10`](MVP_SCOPE.md) for the complete out-of-scope list — if one of these needs
resurfaces, it gets logged as a separate future initiative, not quietly bolted on here.

## Tech stack

| Layer | Choice |
|---|---|
| App | Next.js (App Router) — React frontend + API routes in one process |
| Database | PostgreSQL, self-hosted on the same office machine (not managed/cloud) |
| ORM | Prisma |
| UI | Tailwind CSS v4 + `recharts` |
| Auth | Minimal local auth: staff name + scrypt-hashed PIN, signed HMAC session cookie — no role/permission system (see [`UI_IMPLEMENTATION_REPORT.md §5`](UI_IMPLEMENTATION_REPORT.md)) |
| Deployment | Single Docker Compose stack (app + Postgres) on one office PC/mini-server, accessed by staff over LAN |

Full rationale for each choice (including why PostgreSQL over SQLite) is in
[`CLAUDE.md §6`](CLAUDE.md).

## Getting started

Requires Docker only — no local Node.js or PostgreSQL install needed.

```bash
# 1. Configure secrets (never commit the real .env)
cp .env.example .env
# edit .env: set a real POSTGRES_PASSWORD / SESSION_SECRET

# 2. Build and start the stack (app + Postgres)
docker compose up -d --build

# 3. Apply database migrations
docker compose exec app npx prisma migrate deploy

# 4. (optional) seed demo data — 3 staff, 2 clients, realistic transactions
docker compose exec app npm run seed:demo
```

The app is then served at `http://localhost:3000` (or `http://<office-server-ip>:3000` for other
staff on the LAN). Demo seed login PIN: `1234`.

### Local development (without Docker, for app code only)

```bash
npm install
npm run prisma:generate
npm run dev        # requires a reachable PostgreSQL via DATABASE_URL in .env
```

### Tests

```bash
npm test            # resets a real Postgres test DB, then runs vitest against it
```

## Screens

| Area | Routes |
|---|---|
| Dashboard | `/` |
| Clients & Matters | `/clients`, `/clients/[id]`, `/matters/[id]` |
| Transactions | `/transactions`, `/transactions/[id]` |
| Invoices / Payments | `/invoices`, `/payments` |
| Deposits / Disbursements | `/deposits`, `/disbursements` |
| Cost Details | `/cost-details` |
| Review Center (exceptions) | `/review` |
| Sources & Documents | `/sources` |
| Search (incl. ⌘K global) | `/search` |
| Audit Log | `/audit-log` |
| Reports | `/reports` |
| Settings | `/settings` |

## Architecture at a glance

- **12 tables** (`prisma/schema.prisma` / `ddl_notary_financial_control.sql`): `client`, `matter`,
  `invoice`, `cost_detail`, `financial_transaction`, `payment`, `deposit`, `disbursement`,
  `payment_allocation`, `financial_attachment`, `audit_log`, `staff`, plus `system_setting`.
- `financial_transaction` is an **immutable raw fact** (amount/date/direction can't be edited, only
  voided); `payment`/`deposit`/`disbursement` are 1:1 business classifications layered on top of it.
- Every entity uses a **stable UUID**, never a name, as its identifier.
- Every mutation that matters (link/unlink/allocate/reverse/classify) writes to `audit_log`: who,
  when, previous value, new value, reason. Enforced at the database level with triggers — there is
  no `DELETE` endpoint anywhere in the API.
- `client_id`/`matter_id` on a transaction are nullable by design. **Unlinked is a valid, permanent
  state** — the system never guesses ownership.

See [`SYSTEM_CONSISTENCY_REPORT.md`](SYSTEM_CONSISTENCY_REPORT.md) for a check-by-check audit of
these constraints against the actual code and a live database.

## Project structure

```
src/
  app/
    (app)/            # authenticated pages (dashboard, clients, transactions, ...)
    api/               # route handlers — one folder per resource
    login/
  components/
    ui/                # shared primitives (Button, Card, StatusBadge, ...)
    charts/
  lib/                 # session/auth, financial position formulas, exception rules
prisma/
  schema.prisma
  migrations/
scripts/
  seed-demo.ts
tests/
```

## Documentation map

| File | Purpose |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Project instructions & living context for AI-assisted development — **read this before making changes** |
| [`CHANGELOG.md`](CHANGELOG.md) | Version-by-version change history |
| [`MVP_SCOPE.md`](MVP_SCOPE.md) | Consolidated scope reference: discovery findings, MUST HAVE status, assumptions, unknowns |
| [`SYSTEM_CONSISTENCY_REPORT.md`](SYSTEM_CONSISTENCY_REPORT.md) | Evidence-based audit of the 15 key design constraints against real code/DB |
| [`UI_IMPLEMENTATION_REPORT.md`](UI_IMPLEMENTATION_REPORT.md) | UI build report: screens, components, auth model, bugs found & fixed |
| `ddl_notary_financial_control.sql` | Authoritative DDL (constraints/triggers not expressible in Prisma schema) |

### `docs/` — multi-agent development framework

A structured framework for how (AI-assisted) work on this repo gets scoped, built, verified, and
recorded — start at [`docs/PROJECT_RULES.md`](docs/PROJECT_RULES.md) if you're contributing.

| File | Purpose |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Full product requirements: goals, personas, functional/non-functional requirements, current status per requirement |
| [`docs/PROJECT_RULES.md`](docs/PROJECT_RULES.md) | Binding hard constraints, scope discipline, process & escalation rules |
| [`docs/SYSTEM_OVERVIEW.md`](docs/SYSTEM_OVERVIEW.md) | Technical architecture: request lifecycle, data model, auth, deployment topology |
| [`docs/WORKFLOW.md`](docs/WORKFLOW.md) | The end-to-end change pipeline (with diagram) and its fast path for trivial changes |
| [`docs/AGENT_COMMUNICATION.md`](docs/AGENT_COMMUNICATION.md) | How specialist agents hand off work and report status |
| [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md) | What gets remembered where — Claude's cross-session memory vs. repo docs vs. the `audit_log` table |
| [`docs/REPOSITORY_STRUCTURE.md`](docs/REPOSITORY_STRUCTURE.md) | Folder-by-folder map with agent ownership |
| [`docs/CODING_STANDARD.md`](docs/CODING_STANDARD.md) | API route shape, immutability rules, frontend conventions — grounded in real code |
| [`docs/TESTING_STANDARD.md`](docs/TESTING_STANDARD.md) | Real-database testing philosophy, what requires a test |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Docker Compose runbook, known issues, backup/rollback |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Prioritized backlog, currently led by 3 items raised by office accounting staff |
| [`.claude/agents/`](.claude/agents/) | Operational Claude Code subagents (orchestrator, planner, architect, frontend, backend, QA, debug, security, devops, reporter) implementing the workflow above |

## Known limitations

- Document/Source aggregation on the Matter/Client Position screen only shows attachments linked
  directly to the matter/client, not ones nested under its cost details/invoices/transactions
  (tracked since the UI build — see `UI_IMPLEMENTATION_REPORT.md §11`).
- No role/permission system — any logged-in staff member can perform any action.
- No Excel/bank-statement import — the schema is source-agnostic and ready for it, but no
  format-specific parser has been built pending real sample files.

## Contributing

This is a single-office internal tool developed with AI pair-programming (Claude Code). Before
making changes, read [`CLAUDE.md`](CLAUDE.md) — it encodes the product's non-goals and hard
constraints (e.g. "never force a Client/Matter link", "no destructive delete on financial
records") that are easy to accidentally violate if unaware of the discovery context behind them.
Record any change of consequence in [`CHANGELOG.md`](CHANGELOG.md).
