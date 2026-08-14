# Financial Control Workflow Refinement Report — Phase 2 (Post P0/P1/P2)

Executed against the "Financial Control Workflow Refinement" master prompt, on top of the P0/P1/P2
UX & traceability pass (`FINANCIAL_CONTROL_IMPROVEMENT_REPORT.md`). Scope: make the *existing*
workflow explainable and efficient — no new modules, no automation, no schema change unless
strictly required (none were).

## 1. Executive Summary

Twelve phases were investigated; most needed targeted additions rather than new subsystems,
because prior passes had already built the underlying data/API layer this refinement explains and
operationalizes. One phase (3.4, blocking allocation validation) directly conflicted with a
previously validated business rule and was **not implemented** — flagged to the user per this
prompt's own STOP CONDITION, and the user confirmed keeping the existing non-blocking behavior.
Everything else is implemented, verified against a real database (not inspection alone), and the
regression check (17 pages + auth + API contracts) passed live against a running dev server.

## 2. Discovery Findings Used

Pain scores from the interview drove prioritization exactly as specified: #15 (financial position,
10/10) → Phase 1; #5 (unidentified payment, 10/10) → Phase 2; #7/#6 (partial payment / multi-invoice
allocation, 8/10 and 5/10) → Phase 3; #20 (tracing a transaction, 8/10) → Phases 7/8. The
Excel/WhatsApp/Word workflow remains an explicitly-labeled working hypothesis — no parser or
integration was built against it, consistent with `CLAUDE.md §3`.

## 3. P0 Improvements

**Phase 1 — Financial Position Drill-down.** The anchor-link drill-down pattern already existed
(`SYSTEM_CONSISTENCY_REPORT.md` check #2, PASS) and was kept — rebuilding it as modals would have
been an unrequested redesign. What was missing: **TOTAL footer rows** on every breakdown table
(Cost Detail, Invoice, Payment, Deposit, Disbursement) and **explicit formula captions** for
Outstanding and Deposit Remaining. Both use only numbers `position.ts` already computed — no new
calculation logic, no frontend recomputation of a value the backend already owns. Verified live:
`Outstanding = Total Invoice − Allocated (Rp 50.000.000 − Rp 30.000.000) = Rp 20.000.000` rendered
correctly against real seeded invoice data.

**Phase 2/6 — Unlinked Transaction Workflow / Complete Later.** Investigation found the hard rule
(never force client/matter, UNLINKED is valid) was already fully intact everywhere — no change
needed there. Two real UX gaps: `LinkDrawer`'s status banner combined Client and Matter into one
message, so "client known, matter unknown" (a legitimate, different state per 2.2) looked the same
as "both unknown." Split into two labeled fields. Added an explicit **"Selesaikan nanti"** button,
functionally identical to closing the drawer (no mutation either way) but named so staff see it as
a deliberate, valid choice rather than an implicit cancel.

**Phase 3 — Partial Payment & Allocation.** Status clarity (UNPAID/PARTIALLY_PAID/PAID/OVERPAID)
already existed via `PaymentStatusBadge`, backend-computed, not duplicated. Added: plain-language
explanation on Invoice detail (why a partial payment is Normal vs. will trigger Review Required,
sourced from the invoice's own `allowPartialPayment` flag — the same flag `recomputeReviewStatus`
already uses) and on Payment detail (unallocated amount + the transaction's real `reviewStatus`
badge, not a guessed one).

**Phase 3.4 — NOT IMPLEMENTED, flagged per STOP CONDITION.** The prompt asked for allocation to
become blocking when `SUM(allocation) > payment amount`. The existing route
(`/api/payments/[id]/allocate`) has this explicit, already-validated design comment: *"Never
blocks on over/under-allocation — creates the allocation and lets `recomputeReviewStatus` flag the
outcome... per Step 9's 'never an automatic financial decision, never blocking' principle."*
Making it blocking is a genuine business-rule change, not a UX refinement — flagged to the user
before writing any code. **User decision: keep the existing non-blocking behavior.** No code
changed for this item.

## 4. P1 Improvements

**Phase 4 — Needs Attention.** Extended from 4 to the specified 5 categories in the specified
order (Review Required → Unlinked → **Unallocated** → Source Pending → Outstanding). The new
`unallocatedPaymentCount` was added to the existing `getDashboardSummaryCards()` aggregation, not a
parallel calculation. Added `allocationStatus=UNALLOCATED` filtering to the Payments page (didn't
exist before) so the new category is actually clickable to a real filtered view, not a dead link.

**Phase 5 — Bulk Workflow.** The largest genuinely new piece. Deliberately **no new bulk API
endpoint** — `BulkActionToolbar` calls the existing single-transaction `/link` and `/classify`
routes once per selected id (`Promise.allSettled`, so one failure doesn't block the rest), meaning
every bulk mutation goes through the exact same validation and audit-logging path as a single
action always has. Selection is a new client component (`TransactionsTable`) wrapping the
Transactions page's existing table markup — same columns, same styling, checkbox column added.
Every bulk action requires an explicit client/matter or classification pick (via the same
`Typeahead` used elsewhere) plus an explicit Yes/Cancel confirmation before anything is sent —
never an inferred assignment.

**Phase 7 — Universal Search.** `searchAll()` already supported grouped results (Client/Matter/
Transaction/Invoice/Cost Detail), amount matching, date matching, and UUID matching — no logic
change needed. The page itself was the one screen in the app still using raw inline `style={}`
instead of the Tailwind design system; restyled to match every other list page (Card, EmptyState,
consistent row/section components).

**Phase 8/10 — Transaction Trace / Exception Explanation.** The trace structure (Transaction →
Link → Classification → Allocation → Source → Audit Timeline) was already built in the P0/P1/P2
pass. What Phase 10 specifically asked for — "what can I do?" alongside the existing "why" — was
new: `suggestedActionForReason()` is a deterministic (no AI) pattern match against the exact
`why` strings `recomputeReviewStatus()` already writes to `audit_log.reason`, mapping each to a
plain suggested next step. Unrecognized/manual reasons get no suggestion rather than a guessed one.
Wired into both the Review Center table and the Transaction Trace timeline.

**Phase 9 — Matter Activity Timeline.** Already existed: `FinancialPositionView`'s "Timeline" card,
backed by real `audit_log` history (`getMatterHistory`/`getClientHistory`), read-only. No
`FINANCIAL_EVENT` entity exists or was created. Verified sufficient, not duplicated.

**Phase 6** is the same work as Phase 2 (Complete Later) — see above, not a separate change.

## 5. P2 Improvements

**Phase 11 — Consistency verification.** No code change; a verification pass. `git diff` confirms
`src/lib/position.ts` and `src/lib/exceptionRules.ts` — the two files owning every formula and
rule this refinement explains — are **byte-for-byte unchanged** (empty diff) throughout this
entire phase. Every new formula caption and total row is arithmetic over already-backend-computed
numbers, so `Outstanding = Total Invoice − Allocated`, `Deposit Remaining = Received − Used`, and
`Payment Allocated ≤ Payment Amount` (unchanged, non-blocking-with-flag per the Phase 3.4 decision)
all hold by construction, not by a new independent check.

**Phase 12 — UX refinement.** Search page restyle (above) was the main terminology/consistency
finding — every other screen was already using the shared badge/currency/empty-state components
consistently. No domain terminology was renamed.

## 6. Database Changes

**None.** `git diff prisma/schema.prisma prisma/migrations/` is empty.

## 7. API Changes

No new routes. Two new query parameters on existing pages (not API contract changes — these are
page-level filters, same pattern as the P0/P1/P2 pass's `sourceType`/`outstanding` additions):
`GET /payments?allocationStatus=UNALLOCATED`. No breaking changes to any request/response shape.

## 8. UI Changes

New components: `BulkActionToolbar.tsx`, `TransactionsTable.tsx`. Modified: `FinancialPositionView`
(totals + formula captions), `LinkDrawer` (dual client/matter state + Complete Later),
`TransactionTraceView` / `UnlinkedReviewTable` (suggested actions, LinkDrawer prop update),
Dashboard (`Needs Attention` 5th category), Invoice/Payment detail pages (status explanations),
`/search` (full restyle), Transactions page (delegates its table to the new selectable component).

## 9. Tests

40 passed / 0 failed, up from 32 at the start of this phase:
- 6 new unit tests (`tests/unit/exceptionExplain.test.ts`) — the deterministic suggested-action
  matcher, including a case asserting an unrecognized reason gets no guessed suggestion.
- 2 new scenario tests against a real Postgres database: `unallocatedPaymentCount` reflects a real
  partial allocation (before/after delta, not an absolute count, so it's robust to whatever else
  the shared test DB already contains); partial linking (client known, matter null) persists
  correctly through both the link endpoint and the trace endpoint.
- Live regression smoke test (not just `npm test`): logged into a real running dev server and hit
  all 17 pages from the prompt's regression checklist plus real client/matter/payment IDs — all
  200, Needs Attention/formula captions/TOTAL rows/bulk checkboxes/allocation filter all confirmed
  present with mathematically correct values against real seeded data.

## 10. Build Result

```
npm run build   PASS (compiled successfully, types valid)
npm run lint    PASS (0 warnings/errors)
npm test        PASS (40/40)
```

## 11. Design Decisions

| Decision | Classification | Rationale |
|---|---|---|
| Financial position drill-down | VALIDATED | Pain #15 = 10/10 |
| Unlinked / partial-link as distinct valid states | VALIDATED | Pain #5 = 10/10; explicit interview quote ("staff does not claim it") |
| Auto-claim / inferred ownership | PROHIBITED | Explicit non-goal, reaffirmed this phase — nothing added infers client/matter/classification |
| Bulk linking/classification | DESIGN ASSUMPTION | Working hypothesis about repetitive Excel-like entry (prompt's own framing) — implemented as thin loops over existing endpoints specifically so it stays cheap to remove if the hypothesis doesn't hold |
| Universal search grouping | DESIGN ASSUMPTION / workflow improvement | Already-built capability, just restyled — not a new hypothesis introduced this phase |
| Allocation blocking validation (Phase 3.4) | REJECTED | Conflicts with the validated Step 9 non-blocking principle; user explicitly chose to keep existing behavior over the prompt's Phase 3.4 text |

## 12. Known Limitations

- Bulk classify does not pre-filter selections by transaction direction (PAYMENT/DEPOSIT need IN,
  DISBURSEMENT needs OUT) — a mixed selection will partially fail with a per-row error count shown
  to the user, rather than silently skipping invalid rows or guessing the right subset. This matches
  "never infer" more literally than pre-filtering would, but means the failure count needs reading.
- No component/DOM interaction test infrastructure exists in this repo (carried over from the
  P0/P1/P2 report) — `BulkActionToolbar`'s confirm-dialog and checkbox interactions are verified by
  code review and live smoke test, not automated UI tests.

## 13. Deferred Items

None from this prompt's implementable scope. Phase 3.4 is not "deferred" (which would imply future
implementation is expected) — it's a rejected business-rule change per explicit user decision;
revisiting it would need a fresh, deliberate decision, not just picking it back up later.

## 14. Final Consistency Check

**A. Financial position** — every major aggregate (Outstanding, Deposit Remaining, per-table
totals) traces to real records via formulas displayed against actual backend-computed numbers,
verified live against real seeded data (§9).

**B. Unlinked** — staff can record money with client/matter both null; verified by existing and new
scenario tests (`clientId`/`matterId` both null after creation, `LINK_CLIENT`-only leaves `matterId`
null).

**C. Partial payment** — `allowPartialPayment` on the invoice deterministically distinguishes Normal
from Review Required, now explained in plain language on Invoice/Payment detail, unchanged
computation in `exceptionRules.ts`.

**D. Allocation** — one payment can be allocated across multiple invoices (unchanged, pre-existing);
allocation remains non-blocking with automatic flagging per the Phase 3.4 decision.

**E. Traceability** — Transaction → Client → Matter → Classification → Invoice → Allocation →
Source → Audit is unchanged structurally from the P0/P1/P2 pass, now with suggested-action text
layered onto the audit reasons already shown.

**F. Actionability** — Dashboard's Needs Attention now covers all 5 specified categories in the
specified priority order, each verified clickable to a real filtered destination.

**G. Searchability** — confirmed via live query (`?q=Nusantara` style) against grouped, linked
results; amount/date/UUID matching unchanged from prior implementation.

**H. No auto-claim** — grep across the full diff for auto-link/claim/fuzzy/semantic/AI-provider
keywords returns nothing except a comment explicitly describing what was *not* built.

**I. Auditability** — every mutation bulk actions perform routes through the same `/link`/`/classify`
endpoints that already call `writeAuditLog` inside their own transaction — no new mutation path
bypasses it.

**J. No over-engineering** — `git diff package.json` empty (zero new dependencies), zero new API
endpoints, zero schema changes, zero AI/parser/integration code.

**Final Verdict**: Financial Control workflow refinement is complete for the approved scope.
