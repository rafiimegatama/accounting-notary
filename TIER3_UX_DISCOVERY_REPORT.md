# Tier 3 Solution Discovery Report — Empty States / Inline Editing / Last Updated

**Read-only discovery.** No source code, schema, migration, test, or dependency was changed to
produce this report. Every claim below is either a direct source-code citation (file:line) or an
explicit inference labeled as such. Where the codebase already answers a question the brief asked
to investigate, that is reported as evidence, not assumed.

Scope: T3.1 Better Empty States, T3.2 Safe Inline Editing, T3.3 Last Updated / Updated By.

---

## Executive Summary

All three Tier 3 proposals turn out to be **smaller than they look**, but for different reasons —
this is the headline finding, not a footnote:

- **T3.1 (Empty States) is ~90% already built.** `EmptyState` (`src/components/ui/EmptyState.tsx`)
  already renders title + description + optional action, is wired at 30+ call sites across every
  major screen, already uses contextual Indonesian copy (never generic "No data found" — that
  string does not exist anywhere in `src/`), and already distinguishes "genuinely empty" from "no
  results for this filter" from "nothing needs action" (`page.tsx:84`, `"Semua aman"`) in the
  places that matter most. The only real gaps are narrow: the `action` prop is defined but **never
  used** (0 of 30+ call sites), and one specific filter combination (`?allocationStatus=UNALLOCATED`
  with 0 results) shows a generic "no match" message instead of a positive-outcome one. **Verdict:
  REJECT as a broad initiative — NO MATERIAL GAP. Fix the one specific case if picked up
  opportunistically.**

- **T3.2 (Inline Editing) has its backend already 100% done and its frontend 0% done.** `PATCH`
  routes with full before/after audit logging already exist for Client, Matter, CostDetail,
  Invoice, Transaction (metadata-only), and BankAccount — all audited, several with mandatory
  `reason` fields for financially-material changes (e.g. CostDetail amount → forced `ADJUSTMENT`
  audit action, financially rigorous). **Zero UI anywhere in the app calls most of them** — there
  is no "Edit" button or link on any screen (`grep` for `>Edit<` across `src/`: 0 hits). One
  precedent exists (`UnlinkedReviewTable.tsx`), and it is explicitly *not* true inline editing — it
  is an expand-panel with a full form and an explicit Save button, i.e. the "Quick Edit" pattern the
  brief itself proposes as the safer alternative. **Verdict: REJECT true click-to-edit inline
  editing. BUILD WITH CONDITIONS for "Quick Edit" panels on a short, named list of safe metadata
  fields, reusing the shipping pattern — but this is UI-only wiring onto an already-audited backend,
  not new mutation infrastructure. Validate field priority with Tami before picking the list.**

- **T3.3 (Last Updated / Updated By) is largely already visible, just not pinned to the top.**
  Every entity detail screen that matters (Client/Matter Position, Invoice, Transaction Trace)
  already renders a `Timeline`/`Riwayat` card fed directly by `AuditLog`, sorted
  `occurredAt: desc`, showing `{date+time} · {userId}` per event — the first row of that list *is*
  "last updated, by whom." No model has an `updatedBy` column (correctly — that would duplicate
  `AuditLog`, violating the project's own reuse principle). One real, code-verified risk: on
  Matter/Client Position, the Timeline query (`src/lib/history.ts`) only includes `MATTER`/`CLIENT`
  and scoped `FINANCIAL_TRANSACTION` audit rows — **not** `COST_DETAIL`, `INVOICE`,
  `PAYMENT_ALLOCATION` rows underneath it. A "Last Updated" line pinned to the Matter/Client header
  and naively derived from that same query would under-report recency (editing a cost detail
  wouldn't bump it) — a correctness bug waiting to happen if built carelessly. On single-entity
  pages (Invoice, Transaction) the audit query is already scoped exactly right, so it's safe there.
  **Verdict: BUILD WITH CONDITIONS, narrow scope — single-entity detail headers only (Invoice,
  Transaction, Payment-via-transaction), reusing data already fetched on the page. DEFER the
  Matter/Client Position header treatment until/unless the history-scope gap above is fixed.**

**Bottom line:** none of these are painkillers (none map to a scored pain point in `CLAUDE.md §2`;
they're correctly triaged as Tier 3, below the P0–P2 items that `PAINKILLER_COVERAGE_AUDIT.md`
already scored at 91% overall). The honest recommendation is **build at most one small,
narrowly-scoped thing (the T3.3 single-entity header), fix one two-line copy issue opportunistically
(T3.1's UNALLOCATED empty state), and validate T3.2's field list with Tami before writing any UI
code for it.** Nothing here justifies a dedicated build sprint.

---

## Current State Audit

What already exists, verified directly against the code (all `VALIDATED`):

| Capability | Status | Evidence |
|---|---|---|
| Contextual empty states | Built, broad coverage | `src/components/ui/EmptyState.tsx`; 30+ call sites across Clients/Matters/Transactions/Payments/Invoices/Cost Details/Deposits/Disbursements/Review Center/Search/Sources/Audit Log/Financial Position/Dashboard |
| Empty-state actionability | Prop exists, unused | `EmptyState({ action })` accepts a `React.ReactNode`; `grep "action="` across every `EmptyState` call site in `src/`: **0 matches** |
| Record edit backend | Built for 5 entities | `PATCH` routes: `clients/[id]`, `matters/[id]`, `cost-details/[id]`, `invoices/[id]`, `transactions/[id]` (metadata-only), `bank-accounts/[id]` — all audited via `writeAuditLog` with `previousValue`/`newValue` |
| Record edit frontend | Not built (except one precedent) | 0 `<Edit>` affordances anywhere in `src/`; only `UnlinkedReviewTable.tsx` PATCHes an entity, via an expand-panel form, not inline |
| Audit trail | Built, mature | `AuditLog` model (`entityType`, `entityId`, `action`, `userId`, `occurredAt`, `previousValue`, `newValue`, `reason`); global `/audit-log` page; per-entity Timeline/Riwayat on Client Position, Matter Position, Invoice detail, Transaction Trace |
| `updatedBy` column | Does not exist on any model | `prisma/schema.prisma` — every mutable model has `createdBy`/`createdAt`/`updatedAt` (DB-trigger-maintained) but no `updatedBy`; attribution lives exclusively in `AuditLog.userId` |

---

## T3.1 — Better Empty States

### Existing State

`EmptyState` (`src/components/ui/EmptyState.tsx`) is a single shared component: icon + `title` +
optional `description` + optional `action`. It is already used everywhere a list can be empty. The
copy is already contextual and workflow-aware, not generic — examples pulled directly from the
code:

- Dashboard Needs Attention, zero items: *"Semua aman" / "Tidak ada item yang perlu ditindaklanjuti
  saat ini."* (`src/app/(app)/page.tsx:84`) — this is exactly the "empty = nothing requires action"
  case the brief asks to distinguish, and it's already distinguished correctly.
- Disbursements, none yet: *"Belum ada disbursement" / "Klasifikasikan transaksi (direction OUT)
  sebagai Disbursement dari halaman Transaction Detail."* (`disbursements/page.tsx:123`) — tells the
  user exactly what workflow produces this data.
- Cost Details, filtered vs. genuinely empty are **already two different messages**: *"Tidak ada
  hasil" / "Tidak ada rincian biaya yang cocok dengan filter ini."* vs. *"Belum ada rincian biaya" /
  "Tambahkan cost detail dari halaman Matter."* (`cost-details/page.tsx:103,105`).
- Same filtered/empty split exists independently on Invoices (`invoices/page.tsx:161,163`) and
  Payments (`payments/page.tsx:114,116`).

A literal `grep` for `"No data found"` / generic English filler across `src/` returns **zero
matches**. This proposal's headline example ("replace 'No data found' with contextual messaging")
does not describe a real condition in this codebase.

### Real Pain

Genuinely low. The specific gaps found are narrow, not systemic:

1. **`action` prop is dead code in practice.** Defined, typed, never passed at any of 30+ call
   sites. Every empty state that *tells* the user what to do in prose (e.g. "Tambahkan cost detail
   dari halaman Matter") makes them navigate there themselves rather than offering a button.
2. **Client → Matter is a false-positive case for this gap**, worth calling out explicitly:
   `clients/[id]/page.tsx` already renders `<CreateMatterForm clientId={...} />` in the page header
   (`clients/[id]/page.tsx:59`), visible on the same screen as the "Belum ada matter" empty state
   would be (`FinancialPositionView.tsx:412` equivalent for a client's matter list on
   `clients/page.tsx:130`). The CTA already exists on-page; it's just not literally inside the empty
   state box. Wiring the `action` prop here would be cosmetic consolidation, not a new capability.
3. **One real semantic miss:** `/payments?allocationStatus=UNALLOCATED` returning 0 rows falls
   into the generic `hasFilters` branch — *"Tidak ada hasil" / "Tidak ada payment yang cocok dengan
   filter ini."* (`payments/page.tsx:112-117`). This is the *exact* "0 = good news" case the
   Dashboard already handles well for Needs Attention (`"Semua aman"`), but the Payments list
   doesn't special-case it. A staff member filtering for unallocated payments and seeing "no
   results" (worded like every other empty filter) has to infer for themselves that this is a good
   outcome rather than a stale/wrong filter.

### Evidence

`VALIDATED` — read directly: `EmptyState.tsx`; all 30 call sites listed via `grep`; `clients/[id]/
page.tsx` header composition; `payments/page.tsx` filter branch logic.

### Empty State Audit

| Screen | Current Empty State | Problem | Severity | Suggested Direction |
|---|---|---|---|---|
| Dashboard — Needs Attention | "Semua aman" / no action needed | None | — | Already correct |
| Payments — no filter | "Belum ada payment" + workflow hint | None | — | Already correct |
| Payments — `allocationStatus=UNALLOCATED`, 0 rows | "Tidak ada hasil" (generic filtered) | Conflates "arbitrary filter, no match" with "positive outcome, nothing unallocated" | Low | Special-case this one filter combo with Dashboard-style positive copy |
| Cost Details / Invoices — filtered vs. empty | Two distinct messages already | None | — | Already correct |
| Clients — no matter yet | "Belum ada matter" + prose instruction, `CreateMatterForm` already visible above it | Minor duplication, not a gap | Low | Optional: pass the existing form/button into the `action` prop for visual consolidation only |
| Review Center | "Tidak ada item yang membutuhkan review" | None | — | Already correct |
| Sources / Audit Log | "Belum ada sumber informasi" / "Tidak ada audit event" | None | — | Already correct |
| Transaction Trace — Timeline | "Belum ada riwayat" | None | — | Already correct |
| All other list screens (Transactions, Deposits, Matters, Invoice/Payment detail sub-tables) | Contextual, workflow-specific copy | None found | — | Already correct |

### UX Opportunity

Bounded to two items: (1) wire the existing `action` prop for the 1–2 spots where a CTA is
genuinely additive and doesn't already exist on-page, (2) special-case the UNALLOCATED-filter
empty state. Nothing else surveyed needs a redesign.

### Risks

Essentially none for the narrow fix. The only risk is scope creep — treating "let's audit empty
states" as license to add illustrations, icons-per-screen, or onboarding flourishes the product
doesn't need (explicitly warned against in the brief, and correctly so for a financial ops tool).

### Complexity

LOW. Both identified fixes are single-branch copy/prop changes in already-touched files, zero
schema/API impact.

### Alternative Solutions

None needed — the existing pattern (title + description, contextual copy, occasional two-way
filtered/empty split) is already the right pattern. The only "alternative" worth naming is *not
building anything*, which is the correct call for ~95% of the surveyed screens.

### Tami Validation

Not required to greenlight the two narrow fixes (they're copy/UI-only, reversible, low-risk, and
match a pattern she's presumably already seen work well in Dashboard). If a broader empty-state
pass is ever considered:

> "Waktu kamu lihat halaman kosong seperti [Payments filter unallocated], apakah pesannya jelas itu kabar baik, bukan error atau filter salah?"

### Verdict

**REJECT the broad initiative — NO MATERIAL GAP.** Fix the UNALLOCATED-filter copy opportunistically
(low cost, precise win). Do not schedule a dedicated empty-state project.

---

## T3.2 — Safe Inline Editing

### Existing State

Editing already exists, but only as a **backend capability with no frontend surface** for four of
five entities, plus one shipped precedent that is a "Quick Edit" pattern, not literal inline
editing:

| Entity | `PATCH` route | Editable fields | Immutable / excluded fields | Audit action logic |
|---|---|---|---|---|
| Client | `clients/[id]/route.ts` | name, clientType, contactPhone/Email/Address, identityNumber, status, notes | — | `STATUS_CHANGE` if status changed, else `UPDATE` |
| Matter | `matters/[id]/route.ts` | matterName, matterType, service, status, responsibleStaff, notes | clientId (ownership — no reassignment path at all) | Same pattern |
| CostDetail | `cost-details/[id]/route.ts` | description, category, amount, invoiceId, status, notes | — | `amount` change → forces `reason`, logged as `ADJUSTMENT` (distinct from plain `UPDATE`); status flip → `STATUS_CHANGE` |
| Invoice | `invoices/[id]/route.ts` | dueDate, allowPartialPayment, status, notes | totalAmount (no edit path — by design) | `status → VOID` requires `reason`; else `UPDATE`/`STATUS_CHANGE` |
| FinancialTransaction | `transactions/[id]/route.ts` | notes, sourceType, sourceReference, reviewStatus (manual override) | **amount, transactionDate, direction, clientId, matterId — explicitly excluded**, comment cites a DB-immutability trigger for the first three and the dedicated `/link` endpoint for the last two | `reviewStatus` change requires `reason` |
| BankAccount | `bank-accounts/[id]/route.ts` | (not read in this pass, but route exists) | — | — |

Every one of these routes already writes a full `previousValue`/`newValue` audit entry
(`src/lib/audit.ts`) inside the same DB transaction as the mutation — auditability is not a gap to
solve, it's a constraint already satisfied by the code that would be wired up to.

**Frontend reality:** a repo-wide search for any `Edit` button/link (`>Edit<`, `"Edit"`, `'Edit'`)
returns **zero results**. A search for any component calling these `PATCH` routes returns exactly
one: `UnlinkedReviewTable.tsx`. Its pattern (`ActionPanel`, lines 114–158): clicking "Kelola" expands
a table row into a panel containing a `<select>`, an `<input>`, a `<textarea>`, and an explicit
**"Simpan Note & Source"** button — not click-on-text-to-edit. This is materially the same shape as
the brief's own "Quick Edit" alternative (Section 21, option C), already shipped and working in
production for one field group (transaction notes/source).

### Real Pain

**Unvalidated, likely low-to-moderate.** No painkiller in `CLAUDE.md §2` maps to "editing is too
slow" or "I have to open a detail page to fix a typo." The closest adjacent evidence is indirect:
the fact that the office asked for a **payment correction workflow** (`CHANGELOG.md` v18, Roadmap
item #2, `POST /api/payments/[id]/correct`) shows they do encounter "I need to fix something I
already entered" — but that specific need was already solved with a void+recreate flow deliberately
kept *outside* simple field editing, because payment amount is financially material. There is no
similar direct signal for low-risk fields (descriptions, notes, categories).

### Editable Field Candidates (Quick Edit, not literal inline)

Fields where the backend contract is already exactly what "safe" implies — metadata that doesn't
change financial position, review status, or ownership:

- **CostDetail**: `description`, `category`, `notes` (NOT `amount` — see below).
- **Client**: `notes`, `contactPhone`/`contactEmail`/`contactAddress`, `identityNumber`.
- **Matter**: `notes`, `matterType`, `service`, `responsibleStaff`.
- **Invoice**: `notes`, `dueDate`.
- **FinancialTransaction**: `notes`, `sourceType`, `sourceReference` — **already shipped**, exactly
  matches the `UnlinkedReviewTable` precedent; extending the same panel pattern to the Transaction
  Trace page (not just Review Center) is the lowest-risk possible increment if this is picked up.

### Fields That Must NOT Be Inline Edited

Validated directly against the backend contract, not assumed:

- **FinancialTransaction.amount / transactionDate / direction** — the `PATCH` route *itself*
  refuses these; the code comment says why (DB-trigger immutability, Step 11). Any inline-edit UI
  here would be building a UI for an endpoint that doesn't exist and shouldn't.
- **CostDetail.amount** — technically PATCH-able, but the route enforces a mandatory `reason` and
  logs it as a distinct `ADJUSTMENT` action, not `UPDATE`. If ever surfaced in a UI, it must keep
  that same reason-prompt friction — a bare inline text field that silently PATCHes on blur would
  bypass the deliberate "financial correction needs a reason" design.
- **Invoice.totalAmount** — no edit path exists at all today. Not a gap to fill via inline editing;
  changing an issued invoice's total is a bigger workflow question (credit note? void+reissue?)
  that inline editing should not quietly decide.
- **Client/Matter ownership (which client a matter belongs to, which client/matter a transaction is
  linked to)** — there is no `clientId` field on the Matter `PATCH` route at all, and Transaction
  ownership changes go exclusively through `POST /link` (a separate, purpose-built endpoint with its
  own `LINK`/`RELINK`/`UNLINK` audit actions). Both are structurally excluded from "just edit a
  field" already — this is validated architecture, not something to work around.
- **Payment allocation amounts** — go through `allocate`/`reverse` endpoints with their own
  business rules (non-blocking-but-flagged over-allocation). Never a text field.

### Audit Implications

None of the above candidate fields lose auditability if wired to a Quick Edit panel — the
`PATCH` routes already write `previousValue`/`newValue` unconditionally. The open question is UX,
not audit architecture: does the Quick Edit panel require a `reason` for plain metadata edits
(description/notes typo fixes)? The existing precedent says no — `reason` is only forced for
`amount`/`status→VOID`/`reviewStatus` changes, i.e., only where the backend already decided the
change is financially or operationally material. That precedent should carry over unchanged.

### Financial Integrity Risks

Zero, **if** scope is held to the field list above and the backend's existing exclusions are
respected as-is (not re-implemented, not "helpfully" extended to cover `amount` with a lighter-weight
UI). The single risk scenario worth naming: a future implementer sees "CostDetail.amount is
PATCH-able" and wires a plain inline text input to it without preserving the `reason` requirement —
that would be a real regression in financial control, not a UI nicety. Any implementation task
should carry this constraint explicitly.

### Alternative: Quick Edit

Already the right answer, and already validated in production. Recommend, if built: same shape as
`UnlinkedReviewTable`'s `ActionPanel` — expand-in-place or small modal, explicit Save/Cancel,
loading state, toast on success/failure (the app already has `useToast()` + `toastNextHints.ts` for
this). Not literal click-text-to-edit; not autosave-on-blur. This preserves validation, the
optional-`reason` gate, and an unambiguous "was this saved?" moment — the three things the brief
itself flags as inline editing's biggest risks.

### Tami Validation

This is the one Tier 3 item where the answer genuinely can't be inferred from the code — there is
no signal for which specific fields staff actually mis-enter or need to correct often. Top question:

> "Field apa yang paling sering kamu perlu koreksi setelah disimpan — description, catatan, kategori, atau yang lain? Dan biasanya senormal apa itu terjadi?"

If the answer is "rarely, and I don't mind opening the detail page," this entire feature drops to
DEFER regardless of how cheap the backend makes it.

### Verdict

**REJECT true inline (click-text-to-edit) editing outright** — no evidence it's needed, and it
would weaken the "is this saved?" clarity the current form-based flows already guarantee.
**VALIDATE WITH ACCOUNTANT before building Quick Edit panels** — the backend cost is already paid
(all target routes exist and are audited), so this is cheap *if* the field list is right, but
guessing the field list without asking Tami risks building UI for fields nobody actually needs to
touch quickly.

---

## T3.3 — Last Updated / Updated By

### Existing State

`AuditLog` (`entityType`, `entityId`, `action`, `userId`, `occurredAt`, `previousValue`,
`newValue`, `reason`) is already the single source of truth for attribution, and it's already
surfaced per-entity in multiple places:

- **Matter/Client Financial Position** → `Timeline` card (`FinancialPositionView.tsx:585-602`):
  renders `{formatDateTime(h.occurredAt)} · {h.userId}` for every event, most recent first
  (`src/lib/history.ts` — `orderBy: { occurredAt: "desc" }`). The first list item already *is*
  "last updated, by whom" for that entity.
- **Invoice detail** → `Riwayat` section (`invoices/[id]/page.tsx:25`): `prisma.auditLog.findMany({
  where: { entityType: "INVOICE", entityId: invoice.id }, orderBy: { occurredAt: "desc" } })` —
  scoped exactly to that invoice, no ambiguity.
- **Transaction Trace** → its own audit list (`src/lib/trace.ts:51`), same shape.
- **Payment detail** → no own Timeline; instead links out to the transaction's Trace page
  (`payments/[id]/page.tsx:35`, *"Lihat transaksi →"*). This is consistent, deliberate IA (verified
  by `PAINKILLER_COVERAGE_AUDIT.md` Scenario E: "answerable within 1 interaction layer"), not a gap.

No model defines `updatedBy` (`prisma/schema.prisma` — every mutable model has `createdBy` but not
`updatedBy`). This is correct as-is: adding one would either (a) duplicate what `AuditLog.userId`
already captures for the *last* mutation, violating `CLAUDE.md §6` constraint #6 (reuse existing
entities before adding new fields/tables), or (b) require a new trigger/write path parallel to the
one `writeAuditLog` already owns.

### Audit Capability

Full — every `PATCH`/action route in scope already calls `writeAuditLog` synchronously with the
mutation. There is no case where a change described above happens without a corresponding
`AuditLog` row.

### Operational Value

`INFERRED`, moderate — the brief's example accountant questions ("siapa terakhir mengubah invoice
ini?", "ini angka terbaru atau belum?") are plausible, but for Invoice/Transaction detail the answer
is already one scroll away in `Riwayat`/Timeline, not absent. The value of a *pinned* header line is
saving that one scroll/glance, which is a real but small convenience — not closing an information
gap.

**One code-verified risk, not hypothetical:** on Matter/Client Position, `getMatterHistory`/
`getClientHistory` (`src/lib/history.ts:6-30`) only query `AuditLog` where
`entityType IN ("MATTER"|"CLIENT")` OR (`entityType = "FINANCIAL_TRANSACTION"` AND scoped to that
matter/client's transaction IDs). It does **not** include `COST_DETAIL`, `INVOICE`, or
`PAYMENT_ALLOCATION` audit rows for children of that matter. Concretely: editing a CostDetail's
amount (an `ADJUSTMENT`) or voiding an Invoice under a matter does **not** appear in that matter's
Timeline today, and would **not** bump a "Last Updated" line naively built from `history[0]` on that
page. Building that header line without first fixing (or explicitly scoping around) this gap would
silently mislead staff into thinking a record hasn't changed when it has — a real correctness risk,
found by reading the query, not assumed.

### Best Screens

| Screen | Data already correctly scoped? | Recommendation |
|---|---|---|
| Invoice detail | Yes (`entityType: "INVOICE"` exact match) | Safe to add pinned header line, reusing `audit[0]` already fetched on the page — zero new queries |
| Transaction Trace | Yes (`trace.ts` audit query is entity-scoped) | Same — safe, cheap |
| Payment detail | N/A — no own audit query today, correctly delegates to Transaction Trace | Do not duplicate; leave as-is |
| Matter/Client Position | **No** — `history.ts` under-scopes children (see above) | DEFER until the scope gap is fixed or explicitly accepted as a known limitation in the copy (e.g. label it "Last activity on this Matter/Client record" rather than implying full-record recency) |
| Review Center, Dashboard | Not single-entity views | Not applicable — these are lists, not detail headers |

### UX Treatment

If built: small, secondary text near the header — *"Diperbarui 14 Agu 2026, 14:32 · Budi
Santoso"* — same visual weight as existing secondary metadata (e.g. the attachment upload timestamps
already rendered this way in `FinancialPositionView.tsx:569`). Not a KPI tile, not colored, not
badge-styled. Use the existing `Staff.name` already resolved as `userId` string in Timeline — no new
lookup needed, and per the brief's own privacy note, nothing beyond the display name (no email, no
internal ID) is exposed anywhere in the current pattern.

### Risks

- The under-scoping risk above (Matter/Client Position specifically) — real, code-verified.
- Minor duplication-of-Timeline risk on Invoice/Transaction (low — pinning `audit[0]` restates the
  first Timeline row above the fold, which is the entire point, not a problem).
- No security/privacy risk beyond what Timeline already displays today (staff display name only,
  already the existing pattern).

### Tami Validation

> "Kalau kamu buka Invoice atau Transaction, apakah ‘terakhir diubah kapan/oleh siapa' yang sekarang ada di bagian Riwayat/Timeline itu sudah cukup kelihatan, atau kamu sering butuh lihat itu duluan sebelum scroll ke bawah?"

If the answer is "Timeline is already fine where it is," this drops straight to DEFER — it would be
optimizing a screen distance that isn't actually a friction point for her.

### Verdict

**BUILD WITH CONDITIONS**, narrow: Invoice detail and Transaction Trace headers only, reusing
already-fetched `audit[0]`. **DEFER** Matter/Client Position header treatment until the
`history.ts` scoping gap is resolved or the copy is worded to not overclaim full-record recency.
**Skip Payment detail** — it correctly delegates to Transaction Trace already.

---

## Cross-Feature Analysis

The three features are **independent**, not a coherent workflow — the brief's own example ("Client
has no Matter → empty state → [Tambah Matter]; Matter exists → last updated visible; description
needs correction → Quick Edit") is a plausible narrative but not something actually observed as a
single friction chain in the code or in `CLAUDE.md §2`'s validated pain points. Each stands or falls
on its own evidence:

- T3.1 and T3.3 both turn out to be "make what already exists slightly more visible/precise," not
  "build new information architecture."
- T3.2 is the only one with an actual UI gap (zero edit affordance today) — but it's the one most
  in need of Tami's input before scoping, since backend readiness doesn't tell you which fields
  people actually want to fix quickly.
- None of the three touches allocation, review-status computation, or transaction trace logic —
  all three are safely outside `CLAUDE.md §7`'s core constraints if implemented as scoped above.

---

## Priority Matrix

| Feature | Pain | Frequency | Value | Risk | Complexity | Confidence | Verdict |
|---|---|---|---|---|---|---|---|
| T3.1 — Empty States (broad) | LOW | — | LOW | LOW | LOW | HIGH (code-verified: already built) | REJECT / NO MATERIAL GAP |
| T3.1 — UNALLOCATED filter copy fix | LOW | MEDIUM (recurring filter use) | LOW | LOW | LOW | HIGH | BUILD (opportunistic, not a project) |
| T3.2 — True inline editing | UNKNOWN | UNKNOWN | LOW–MEDIUM | MEDIUM (financial-field misuse risk if scope drifts) | LOW (backend done) / MEDIUM (UI safety) | LOW (no field-priority evidence) | REJECT (true inline) |
| T3.2 — Quick Edit (scoped fields) | UNKNOWN | UNKNOWN | MEDIUM | LOW (if scope held) | LOW (backend done, UI-only) | LOW–MEDIUM | VALIDATE WITH ACCOUNTANT |
| T3.3 — Invoice/Transaction header | LOW–MEDIUM | MEDIUM | MEDIUM | LOW | LOW (data already fetched) | HIGH | BUILD WITH CONDITIONS |
| T3.3 — Matter/Client Position header | LOW | MEDIUM | LOW–MEDIUM | MEDIUM (under-scoped data risk) | MEDIUM (needs history.ts fix first) | MEDIUM | DEFER |

---

## Architectural Impact

| Proposal | Frontend | Backend | Database | Testing | Audit | Operational Risk | Maintenance |
|---|---|---|---|---|---|---|---|
| T3.1 (narrow fix) | LOW | NONE | NONE | LOW | NONE | LOW | LOW |
| T3.2 (Quick Edit, scoped) | MEDIUM (new panels × N entities) | NONE (routes exist) | NONE | LOW–MEDIUM | NONE (already covered) | LOW (if scope held) / MEDIUM (if scope drifts to material fields) | MEDIUM (one more UI pattern to keep consistent across entities) |
| T3.3 (single-entity header) | LOW | NONE | NONE | LOW | NONE | LOW | LOW |
| T3.3 (Matter/Client header) | LOW | LOW (extend `history.ts` scope) | NONE | LOW | NONE | MEDIUM (until scope fixed) | LOW |

---

## Recommended Next Step

**Option 4 — Validate only specific feature(s), build the rest narrowly or not at all:**

1. Fix the T3.1 UNALLOCATED-filter empty-state copy whenever `payments/page.tsx` is next touched —
   too small to justify a standalone task, cheap enough to bundle into any nearby change.
2. Ask Tami the T3.2 field-priority question before writing any Quick Edit UI. Do not guess the
   field list from the backend's capability — capability ≠ demand here.
3. If pursued, build T3.3 narrowly (Invoice + Transaction Trace headers only) as a small, self-
   contained task — it's cheap, correct, and low-risk exactly because it reuses data already on the
   page. Do not extend it to Matter/Client Position without first deciding how to handle (or word
   around) the `history.ts` scoping gap.
4. Do not build true inline editing, and do not build a generic "empty state redesign" — both would
   be solving problems the code shows are already solved or were never real.

This does **not** produce a bigger backlog — it closes two of three items (T3.1 mostly done, T3.3
mostly a copy/placement question) and correctly routes the one genuinely open question (T3.2's field
list) back to the person who can actually answer it.

---

## TOP QUESTIONS FOR TAMI

Only the questions that could change a build/no-build decision:

1. **(T3.2 — decides scope entirely)** "Field apa yang paling sering kamu perlu koreksi setelah
   disimpan, dan seberapa sering itu terjadi?"
2. **(T3.3 — decides whether to build at all)** "Info 'terakhir diubah kapan/oleh siapa' yang sudah
   ada di Riwayat/Timeline sekarang — itu sudah cukup kelihatan, atau kamu sering butuh lihat itu
   duluan sebelum scroll?"
3. **(T3.1 — sanity check only, low stakes either way)** "Waktu filter Payments ke 'Belum
   teralokasi' dan hasilnya kosong, apakah jelas itu artinya semua sudah teralokasi (kabar baik)?"

---

## Over-Engineering Verdict

Explicitly should **NOT** be built:

- A general empty-state redesign, illustration system, or "onboarding" treatment — the current
  plain, contextual title+description pattern is already correct for a financial ops tool and
  already covers the surveyed screens.
- True click-to-edit inline editing on any field, anywhere — no validated need, and it would blur
  the "was this saved?" clarity the current explicit-Save pattern already guarantees.
- Any Quick Edit surface for `amount`, `totalAmount`, `direction`, `transactionDate`, allocation
  amounts, or client/matter ownership — these are correctly gated behind dedicated workflows
  (`/link`, `/allocate`, `/correct`) today, and a lighter-weight edit UI for any of them would be a
  regression in financial control, not a convenience.
- A new `updatedBy` column or a parallel "last updated" tracking mechanism — `AuditLog` already
  owns this; duplicating it violates the project's own reuse principle (`CLAUDE.md §6` #6).
- A "Last Updated" header on Matter/Client Position **as currently query-scoped** — would silently
  misreport recency for child-record changes (CostDetail/Invoice/PaymentAllocation edits), a real
  bug, not a nitpick.
