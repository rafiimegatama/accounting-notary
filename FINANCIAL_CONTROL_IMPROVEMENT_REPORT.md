# Financial Control Improvement Report — P0/P1/P2 UX & Traceability Pass

Executed against the P0/P1/P2 improvement brief on top of the existing MVP (Steps 1–22,
`MVP_SCOPE.md`) and UI build (`UI_IMPLEMENTATION_REPORT.md`). Scope: ergonomics, navigation,
discoverability, traceability, evidence visibility, dashboard actionability — no redesign, no new
domain entities, no AI, no new dependencies. See `CLAUDE.md §8` (v7) for the changelog row and
`CHANGELOG.md` for the detailed entry.

## 1. Executive Summary

All three priority tiers are implemented and verified against the real codebase (not inspection
alone — every claim below was confirmed by `npm run build`, `npm run lint`, `npm test`, and direct
grep/diff evidence). Two tiers turned out to require less new work than expected because
investigation showed the underlying behavior was already correct (P1.1 client→matter cascading)
or the fix was a targeted CSS/data bug rather than a new feature (P0.1 sidebar). Two real,
previously undocumented gaps were found and closed along the way: `deposit` data was fetched but
silently dropped before reaching the Transaction Trace view, and **no attachment download route
existed anywhere in the app** — every attachment listing (Position, Invoice, Payment) showed a
filename as inert text. Zero new dependencies, zero schema changes, zero new domain entities.

## 2. P0 — Core UX Fixes

**P0.1 Sidebar collapse/expand.** Root cause: at collapsed width (64px) with existing padding, the
content box (32px) was narrower than the logo icon alone (36px) — the toggle button rendered
outside the visible bounds and was painted over by the main content header. Fixed by giving the
collapsed state its own single-purpose header (just the toggle, centered) instead of cramming the
same three-element row into a quarter of the space. Added `title` tooltips on collapsed icons and
an active-route accent bar (both explicitly required, both previously absent). Added `localStorage`
persistence using the same pattern already established by `LockScreen`'s `sessionStorage` use.

**P0.2 Keyboard-first data entry.** The New Transaction form's DOM/tab order already matched the
requested logical order (Date → Direction → Amount → Description → Client → Matter → Financial
Type → Source Type → Source Reference → Notes → Save) — no reordering needed. The real gap was the
Client search dropdown: mouse-only, zero keyboard support, in both `NewTransactionModal` and
`LinkDrawer`. Required-field validation and Save-button reachability were already correct (native
HTML5 `required` + normal tab order) — left as-is per "use native browser/React behavior."

**P0.3 Predefined value autocomplete.** New `Typeahead` component (Tab commits, Enter commits,
Escape dismisses, arrows navigate, free text always allowed — deterministic prefix matching, no
AI/fuzzy logic). Applied to: Cost Detail Category (new advisory vocabulary list,
`COST_CATEGORY_SUGGESTIONS` in `src/lib/enums.ts`, explicitly not a DB enum) and Client search
(both forms, fixing the P0.2 gap in the same pass, plus a 250ms debounce added since it's
network-backed). **Financial Type and Source Type were deliberately left as native `<select>`** —
they're real DB-enforced enums already fully keyboard-accessible; converting them to a typeahead
would have been a regression dressed up as a feature.

## 3. P1 — Workflow Improvement

**P1.1 Client→Matter cascading.** Investigation showed this was **already correctly implemented**:
`/api/matters?clientId=` filters server-side (confirmed by reading the route), and both forms
already cleared the selected matter whenever the client query changed. Made the invalidation
explicit in code (defensive, not cosmetic) and fixed a real inconsistency: the Dashboard's
"Unlinked Transactions" card linked to `/review`, which the Review Center's own code comment says
explicitly excludes unlinked-but-normal transactions. Now links to `/transactions?linked=unlinked`.

**P1.2 Dashboard "Needs Attention."** New section, reusing the existing summary aggregation (added
one genuinely missing count, `sourcePending`, to `getDashboardSummaryCards`). Four items in the
specified priority order, each clickable to a correctly filtered view — which required adding
`sourceType` filtering to the Transactions page and `outstanding` filtering to the Invoices page
(neither existed before). Items with a zero count don't render (no alert spam); an all-clear state
shows when nothing needs attention.

**P1.3 Transaction Detail Trace.** Two real gaps found while wiring "single source of context":
`deposit` was included in the Prisma query but never surfaced in `buildTransactionTrace`'s return
value — now added. Payment allocations showed amount + invoice number only, not the invoice's
Outstanding — now shown via one small batched query over the (typically 1–3) invoice IDs a
transaction actually touches, not a per-row query. `transaction.notes` was fetched but dropped —
now shown. `SOURCE_PENDING` now renders as "Source belum dilengkapi" instead of the raw enum
string, consistent with its non-blocking WARNING classification.

## 4. P2 — Source/Evidence Visibility

**P2.1/P2.2** were substantially satisfied by the P1.3 work above (Source Type/Reference display,
SOURCE_PENDING messaging, attachments). One infrastructure gap made "attachment visibility"
meaningless until fixed: **no download route existed anywhere in the app.** Added
`GET /api/attachments/[id]` (same auth pattern as every other route — `getCurrentUser` first,
404 on missing record or missing file) and made all four existing attachment listings (Position,
Invoice detail, Payment detail, Transaction Trace) consistently clickable instead of leaving one
page fixed and the rest showing inert filenames.

**P2.3 Matter source aggregation.** Closes `SYSTEM_CONSISTENCY_REPORT.md` check #1's long-standing
WARNING. New `getMatterSourceSummary()` walks the existing specific FK columns on
`FinancialAttachment` (matter/costDetail/invoice/transaction — no schema change, no polymorphic
redesign) and returns every attachment tagged with which entity it actually came from, with a link
where one exists. The Matter Position screen's old caveat text ("dokumen individual ada di
masing-masing detailnya") is removed because it's no longer true.

**P2.4 Client source summary — not deferred.** Extending the same pattern from Matter to Client
scope is one more join level (client → its matters → their children), which meets the spec's own
bar for "effort kecil" (no schema change), so it was implemented rather than deferred. New
`getClientSourceSummary()` returns a count plus a capped recent list (default 10), rendered as
"Sources & Documents [N]" with a "showing X of Y" note when capped.

## 5. Files Changed

```
src/components/Sidebar.tsx                      P0.1
src/components/ui/Typeahead.tsx                 P0.3 (new)
src/lib/enums.ts                                P0.3 (COST_CATEGORY_SUGGESTIONS + matcher)
src/components/AddCostDetailModal.tsx           P0.3
src/components/NewTransactionModal.tsx          P0.2/P0.3/P1.1
src/components/LinkDrawer.tsx                   P0.2/P0.3/P1.1
src/lib/dashboard.ts                            P1.2
src/app/(app)/page.tsx                          P1.2
src/app/(app)/transactions/page.tsx             P1.2 (sourceType filter)
src/app/(app)/invoices/page.tsx                 P1.2 (outstanding filter)
src/lib/trace.ts                                P1.3
src/components/TransactionTraceView.tsx         P1.3/P2.2
src/app/api/attachments/[id]/route.ts           P1.3/P2.1 (new)
src/components/FinancialPositionView.tsx        P2.2/P2.3/P2.4
src/app/(app)/matters/[id]/page.tsx             P2.3
src/app/(app)/clients/[id]/page.tsx             P2.4
src/app/(app)/invoices/[id]/page.tsx            P2.1 (attachment link)
src/app/(app)/payments/[id]/page.tsx            P2.1 (attachment link)
src/lib/sources.ts                              P2.3/P2.4
tests/unit/costCategorySuggestions.test.ts      P0.3 (new)
tests/scenarios/masterPromptScenarios.test.ts   P1.3/P2.3/P2.4 (extended + new)
```

## 6. API Changes

- **New**: `GET /api/attachments/[id]` — downloads the file an attachment record points to. Same
  auth pattern as every other route (`getCurrentUser`), 404 on missing record or missing file.
- **Extended query params** (no breaking change, both previously accepted no filter for these):
  `GET /transactions?sourceType=` (page-level filter, not the underlying API), `GET /invoices?outstanding=1`.
- No changes to any existing request/response contract.

## 7. Database Changes

**None.** No migration, no schema change, no new table, no new column. Confirmed by
`git diff prisma/schema.prisma prisma/migrations/` returning empty.

## 8. Tests

32 passed / 0 failed (`npm test`), up from 23 at the start of this pass:
- 7 new unit tests (`tests/unit/costCategorySuggestions.test.ts`) covering the deterministic
  prefix-matching logic (`"BP" → BPHTB`, `"PN" → PNBP`, `"Ma" → Materai`, case-insensitivity, no
  match ≠ error, prefix-only not substring).
- Scenario 12 extended with real download/401/404 assertions for the new attachment route.
- 2 new scenario tests for P2.3/P2.4 aggregation, both explicitly asserting no duplicate
  attachments (per the spec's testing requirements) using a real Postgres database, not mocks.

**Known limitation, not silently skipped**: this repo has no component/DOM interaction testing
infrastructure (`jsdom`, `@testing-library/react`) — only route-handler tests against a real
database. Full keyboard-interaction tests (sidebar collapse as a simulated click, Tab-to-commit as
a simulated keydown, Escape-dismiss) are not covered, because adding that infrastructure is a real
new-dependency decision the brief explicitly warned against. Deterministic *logic* (the matcher) is
unit-tested instead.

## 9. Build Result

```
npm run build   PASS  (Next.js 14.2.35, compiled successfully, types valid)
npm run lint    PASS  (0 warnings/errors)
npm test        PASS  (32/32)
```

## 10. Known Limitations

- No component/DOM interaction test coverage (see §8).
- P1.2's "Source Pending" and "Unlinked" Needs Attention items both link into `/transactions` with
  different filters rather than a single unified queue — matches the existing app's established
  separation (Review Center vs. Transactions filters, `UI_IMPLEMENTATION_REPORT.md`), not a new
  inconsistency.
- Attachment download has no virus scanning or content-type sniffing beyond what was uploaded —
  unchanged risk profile from before (files were already stored as-is), just now retrievable.

## 11. Deferred Items

None from this brief — P2.4 (the one item explicitly conditional on effort) was implemented, not
deferred, since it required no schema change.

## 12. Final Consistency Result

**A. Domain consistency** — CLIENT → MATTER → COST/INVOICE/PAYMENT/DEPOSIT/DISBURSEMENT →
FINANCIAL_TRANSACTION → SOURCE/ATTACHMENT/AUDIT unchanged. No new domain entity: `git diff` shows
zero new Prisma models, zero new API resource types — `sources.ts`'s new functions compose existing
queries, they don't back a new table.

**B. Business rule consistency** — `src/lib/exceptionRules.ts` and `src/lib/position.ts` (partial
payment, overpayment, review-status derivation, financial position formulas) are **untouched**:
`git diff` for both files is empty. UNLINKED remains a valid, non-forced state (unchanged in
`NewTransactionModal`/`LinkDrawer`'s submit logic). No auto-claim/fuzzy/AI code was introduced —
confirmed by grep across the diff for `autolink|autoclaim|fuzzy|semantic|openai|anthropic|gpt`,
matches found only in a comment explicitly describing what was *not* built. Audit trail: no new
mutation route was added other than the read-only attachment download, so no new `writeAuditLog`
call sites were needed; existing ones are unchanged.

**C. UX consistency** — sidebar reversible (verified via the CSS math root-cause and layout fix),
keyboard entry works (native tab order + new Typeahead contract), autocomplete works (unit-tested
matcher + manual trace of the component's event handlers), client→matter works (was already
correct, now explicit), dashboard actionable (Needs Attention wired to real filtered destinations),
transaction trace understandable (deposit/notes/outstanding/attachments all now surfaced),
sources discoverable (Matter and Client aggregation both closed, download route makes them usable).

**D. No over-engineering** — `git diff package.json` is empty (zero new dependencies). No duplicate
entity, no duplicate API (the new `sourceType`/`outstanding` params extend existing routes, they
don't fork new ones), no duplicate financial calculation (`sourcePending`/invoice-outstanding
computations were added to the *existing* aggregation functions, not new parallel ones), no schema
redesign, no AI feature, no external integration.

**Final Verdict**: Implementation is complete for P0/P1/P2 scope.
