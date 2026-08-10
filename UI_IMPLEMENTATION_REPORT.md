# UI Implementation Report

One-shot build executed against the Step 1–22 functional contract (see `CLAUDE.md`,
`MVP_SCOPE.md`, `SYSTEM_CONSISTENCY_REPORT.md`). This document covers the UI + full
application integration pass on top of that contract.

## 1. Screens Implemented (20)

| Screen | Route | Notes |
|---|---|---|
| Login | `/login` | New — minimal local auth |
| Dashboard | `/` | Rebuilt with charts (financial trend, review distribution), matter overview, recent activity |
| Clients & Matters | `/clients` | Rebuilt — tabs (Clients / Matters), aggregated columns |
| Client Detail | `/clients/[id]` | Restyled, `View Matters` action |
| Matter Detail | `/matters/[id]` | Restyled — the signature screen (Section 40); `Add Cost` / `Create Invoice` actions |
| Transactions | `/transactions` | Rebuilt with filters (date, direction, link status, review status, financial type) |
| Transaction Detail | `/transactions/[id]` | Restyled; Link drawer, Classify, Allocate, Void actions wired in |
| Cost Details | `/cost-details` | Restyled, added Invoice/Status columns |
| Invoices | `/invoices` (+ `/invoices/[id]`) | **New** |
| Payments | `/payments` (+ `/payments/[id]`) | **New**, with allocate/reverse actions |
| Deposits | `/deposits` | **New** |
| Disbursements | `/disbursements` | **New** |
| Review Center | `/review` | Rebuilt — now review-status only (Unlinked moved to Transactions filter per Section 19) |
| Sources & Documents | `/sources` | **New** |
| Audit Log | `/audit-log` | **New**, read-only, filterable |
| Reports | `/reports` | Rebuilt — links to real data + CSV export (was a placeholder) |
| Settings | `/settings` | **New**, read-only (exception-rule defaults, active staff) |
| Search | `/search` | Unchanged (Step 18), now also reachable via ⌘K global search |

## 2. Components Created (24 in `src/components/`)

Shell: `Sidebar`, `AppShellClient`, `GlobalSearch`, `NewTransactionModal`, `LockScreen`.
UI primitives (`ui/`): `Button`, `Card`, `StatusBadge` (Link/Review/Payment/Generic — kept as
three distinct badge types per Principle 2, never merged), `EmptyState`, `Skeleton`, `Toast`,
`SummaryCard`, `Tabs`. Charts: `FinancialTrendChart`, `ReviewDonutChart` (recharts). Actions:
`LinkDrawer`, `TransactionActions` (Classify/Void/Allocate/ReverseAllocation), `AddCostDetailModal`,
`CreateInvoiceModal`, `CreateClientForm`. Restyled from Step 15/16/17: `FinancialPositionView`,
`UnlinkedReviewTable`, `TransactionTraceView`.

## 3. API Endpoints

**Used**: all 25 endpoints from Step 13/19 (unchanged contracts).
**Created (10)**: `/api/auth/{login,logout,me,staff,verify-pin}`, `/api/deposits`,
`/api/disbursements`, `/api/audit-log`, `/api/sources`, `/api/reports/transactions/export`.

Every GET route (25 total, previously only mutation routes were protected) now calls
`getCurrentUser`/`getCurrentSession` — closed during this build, see §6.

## 4. Database Changes

2 new migrations: `add_staff_auth` (Prisma-generated: `staff` table), `staff_constraints`
(hand-written: `chk_staff_status` CHECK + `trg_staff_no_delete` trigger, following the exact
pattern established in Step 11/12 — no destructive delete on this table either). No changes to
any existing table. 4 migrations total in the project.

## 5. Authentication (Section 23)

No auth existed before this build (`x-staff-name` was a client-supplied, unverified header —
explicitly flagged as a gap since Step 13). Built minimal local auth appropriate to this
project's scale:
- `staff` table (name + scrypt-hashed PIN, no roles/permissions — every staff account can do
  everything, matching office size and the non-goal of complex approval workflow).
- Stateless HMAC-signed session cookie (`src/lib/session.ts`), 12h TTL.
- `middleware.ts`: cheap cookie-presence redirect (Edge runtime can't use Node's `crypto`
  the way session signing needs).
- Every page (`requireSession()`) and every API route (`getCurrentUser`/`getCurrentSession`)
  does the real cryptographic verification server-side — Section 43: "Frontend hiding buttons
  is NOT authorization."
- Lock screen: client-side overlay (`sessionStorage` flag) requiring PIN re-entry via
  `/api/auth/verify-pin`; the session cookie itself stays valid — this is a screen lock for a
  shared terminal, not a second auth factor.

## 6. Bugs Found and Fixed During This Build

1. **Audit trail gap** (`src/lib/exceptionRules.ts`): `recomputeReviewStatus()` changed
   `review_status` automatically after allocate/reverse but never wrote an audit log entry —
   found while wiring the Timeline UI and confirmed by grep cross-check. Fixed: added
   `writeAuditLog` call + `userId` parameter; both call sites updated. New regression test added
   (`tests/scenarios/masterPromptScenarios.test.ts`, Scenario 8's second `it()`).
2. **Missing GET-route auth** (18 route handlers): only mutation endpoints called
   `getCurrentUser` before this build; every read endpoint was unauthenticated. Closed as part
   of building real login — now all 25 GET handlers enforce a valid session.
3. **Stale static cache on `/api/auth/staff`**: this route took no request params, so Next.js
   pre-rendered it as a static route at build time — meaning it served whatever the staff table
   looked like *at build time*, not live data. Found during manual QA (login picker showed an
   empty list despite seeded staff existing in the database). Fixed with
   `export const dynamic = "force-dynamic"`.
4. **Missing Suspense boundary** on `/login` (`useSearchParams()` requires one) — caught by
   `next build`'s prerender step, fixed by wrapping the form in `<Suspense>`.
5. Several `Prisma.Payment`/`Prisma.Deposit`/`Prisma.Disbursement` field-name bugs
   (`transactionId` vs the actual `financialTransactionId`) — caught by `next build`'s
   type-checking across `deposits`, `disbursements`, `invoices/[id]`, `payments/[id]` pages.

## 7. Tests

**23 passed, 0 failed** (`npm test`) — 14 original master-prompt scenarios + 2 unit test files +
2 new tests added this pass (overpayment → REVIEW_REQUIRED; disbursement classification →
reflected in Matter Position), run against a real, freshly-reset PostgreSQL database (Docker).
Test auth now uses real signed session cookies (`tests/helpers/callApi.ts`), not a bypass header.

## 8. Build

**PASS.** `npm run build` — exit 0, 20 pages + 35 API routes compiled.
**Lint: PASS.** `npm run lint` — 0 warnings/errors (ESLint + `eslint-config-next` newly configured).
**Typecheck: PASS** (part of `next build`).

## 9. Manual QA

Logged in as a real seeded staff member (PIN-based), walked all 20 authenticated routes with
real IDs from demo data against a freshly-restarted production server (`npm start`): all HTTP 200,
zero server-side errors in logs. Verified Matter Detail renders correct computed figures (Total
Cost, Invoice, Payment, Outstanding, Deposit Received/Used/Remaining) and a full audit-trail
timeline including the Step 22 fix's `STATUS_CHANGE` entries with reasons.

## 10. Demo Data

`scripts/seed-demo.ts` (`npm run seed:demo`) — seeds through the real route handlers (not raw
SQL), so audit trail and review-status computation are populated exactly as a real user's actions
would produce them. Covers: 3 staff (PIN `1234`), 2 clients (PT Nusantara Properti — company;
Ratna Kusuma — individual), realistic notary cost categories (PNBP, BPHTB, Honorarium, Materai),
a normal + a REVIEW_REQUIRED partial payment, multi-invoice allocation, deposit + disbursement,
2 unlinked transactions, a WARNING (source-pending) transaction, and a relink-correction
demonstrating timeline history.

## 11. Known Limitations

- **Step 22 WARNING carried forward, unchanged**: Document/Source aggregation on Matter/Client
  Position still only shows attachments linked directly to the matter/client, not ones nested
  under its cost details/invoices/transactions. `/sources` (new, this build) partially mitigates
  this — it's a flat cross-matter list — but the Position screen itself still has the gap.
- Settings page is read-only — changing exception-rule defaults (`system_setting`) requires
  direct DB access; no settings-CRUD API or UI was built (judged not worth a new audit-log
  entity type for a rarely-changed config, per Section 41 "avoid overengineering").
- No role/permission system — every logged-in staff member can perform every action.
- CSV export exists only for Transaction History; no PDF report engine (explicitly out of scope,
  Section 21: "Do not build ... unless already available").
- Lock screen is a UI convenience, not a real second factor — the underlying session stays valid
  while locked.

## 12. Design Assumptions (Unvalidated)

- PIN-based auth (not username/password) — assumed appropriate for a shared office terminal;
  not confirmed with actual office security policy.
- 12-hour session TTL — arbitrary "a work day" choice, not validated.
- Matter list (Section 8) shown as a tab under `/clients` rather than its own top-level page —
  kept from Step 14's IA decision, not re-litigated.
- Overpayment always → `REVIEW_REQUIRED` with no exception path (same assumption already flagged
  in Step 9 — some overpayments might be intentional, e.g. becoming additional deposit).

## 13. Next Recommended Step (not implemented)

Resolve the Document/Source aggregation gap properly (either a lightweight join across
cost_detail/invoice/transaction attachments for the Position screen, or accept `/sources` as the
permanent answer and remove the caveat text). This is a recommendation only, per the instruction
not to auto-implement future scope.
