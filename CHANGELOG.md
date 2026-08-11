# Changelog

All notable changes to this project are documented here, following the spirit of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This file is the canonical,
human-readable change history for the project.

`CLAUDE.md §8` also carries a condensed version of this history for AI-agent context — keep the
two in sync when adding an entry (add here first, then mirror a one-line summary there).

## [Unreleased]

## [v5] - 2026-08-11

### Fixed
- Docker build was completely broken for any real deployment: `node:20-alpine` lacks OpenSSL,
  which Prisma's schema/migration engine binaries require at runtime. `prisma migrate deploy`
  failed with an unparsable engine response inside the container. Fixed by installing `openssl`
  in both the `builder` and `runner` stages of `Dockerfile`.

### Added
- `README.md` — project overview, problem statement, tech stack, quick start, screens, and a
  documentation map linking to the existing build reports.
- `CHANGELOG.md` (this file) — standardized change tracking going forward, migrated from the
  version table previously kept only in `CLAUDE.md §8`.

### Infrastructure
- Repository initialized on GitHub (`rafiimegatama/accounting-notary`), `main` branch pushed
  with full existing history.
- Verified a full local rebuild-from-scratch (`docker compose build --no-cache` → `up -d` →
  `prisma migrate deploy` → `seed:demo`) against a fresh Postgres volume, confirming the Docker
  path is a genuinely working deployment path, not just `npm run dev`.
- Temporary ngrok tunnel set up for remote demo access to the Dockerized stack (ephemeral
  free-tier URL, not a permanent deployment change — see `CLAUDE.md §6` for the actual LAN-only
  deployment model, which is unchanged).

## [v4] - 2026-08-10

### Added
- Complete UI + application integration pass on top of the Phase 1–22 functional contract:
  Tailwind design system, minimal local auth (staff + PIN, signed session cookie, lock screen),
  app shell (sidebar + header + ⌘K global search), 20 pages total (6 new: Invoices, Payments,
  Deposits, Disbursements, Sources, Audit Log, Settings), 10 new API endpoints.
- Demo seed data (`npm run seed:demo`) — seeds through real route handlers so audit trail and
  review-status computation populate exactly as real usage would produce them. Demo PIN: `1234`.

### Fixed
- Audit trail gap in `recomputeReviewStatus()` (same class of bug as the v3 fix, this time at the
  `allocate`/`reverse` call sites) — regression test added.
- 18 GET routes were not enforcing auth (only mutation routes were protected before this pass).
- `/api/auth/staff` was being statically cached at build time by Next.js, serving stale staff
  lists in production — found during manual QA, fixed with `export const dynamic = "force-dynamic"`.
- Missing `<Suspense>` boundary on `/login` (required by `useSearchParams()`).

See `UI_IMPLEMENTATION_REPORT.md` for full detail (23/23 tests passing; build/lint/typecheck all
green).

## [v3] - 2026-08-10

### Added
- MVP build complete (Steps 1–22 of the master implementation prompt): full data model, all
  MUST HAVE features, 14 real test scenarios against PostgreSQL.

### Fixed
- Step 21 found 5 nav pages that were referenced but never built (`/`, `/clients`,
  `/transactions`, `/cost-details`, `/reports`) — closed.
- Step 22 found one real audit-trail gap (`recomputeReviewStatus` changing status without
  logging) — fixed and proven with a new test.

### Notes
- Final state: 9/9 MUST HAVE features built and tested, 14/15 consistency checks PASS, 1 WARNING
  (Document/Source aggregation incomplete — honestly labeled in the UI itself, not hidden), 0 FAIL.
  See `SYSTEM_CONSISTENCY_REPORT.md` and `MVP_SCOPE.md`.

## [v2] - 2026-08-10

### Added
- `Dockerfile` + `docker-compose.yml` — run the whole stack (Next.js + PostgreSQL) with nothing
  installed on the host beyond Docker. Also used to actually execute the 14 Step 20 test
  scenarios, since the original sandbox had no PostgreSQL installed and no sudo access.

## [v1] - 2026-08-10

### Changed
- **Database: SQLite → PostgreSQL.** Deployment scope was confirmed as multi-user LAN (several
  accounting staff accessing the system simultaneously from different machines). SQLite carries
  real risk under concurrent cross-machine writes; PostgreSQL was chosen instead while keeping
  the system 100% on-premise/local to one office server. Next.js and Prisma were unaffected.

## [v0] - 2026-08-10

### Added
- Project initialized from a greenfield state. Stack confirmed: Next.js + SQLite (later revised
  in v1) + Prisma.
