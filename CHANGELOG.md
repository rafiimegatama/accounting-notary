# Changelog

All notable changes to this project are documented here, following the spirit of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This file is the canonical,
human-readable change history for the project.

`CLAUDE.md §8` also carries a condensed version of this history for AI-agent context — keep the
two in sync when adding an entry (add here first, then mirror a one-line summary there).

## [Unreleased]

## [v39] - 2026-08-14

### Added — Remaining 3 DevOps findings: git-SHA image tagging/rollback, pre-migration snapshot, capacity tracking

Closes items 4-6 of the same architecture review v38 addressed items 1-3 of. Also answered a direct
question in this session: no, Grafana/Prometheus or Elastic/Kibana would be over-engineering for this
stack (single office, no dedicated IT staff, contradicts the explicit "no alerting infrastructure"
decision already in §13) — declined, not implemented; the scripts below are the right-sized
alternative already established by this project's own pattern.

**4. Rollback previously meant rebuild-and-pray.** `docker compose build` overwrote the local `app`
image in place — nothing was kept to fall back to, so §6's "redeploy the previous image/commit" meant
rebuilding that commit and hoping the build environment hadn't shifted. Fixed: `docker-compose.yml`'s
`app` service gained an explicit `image: notary-accounting-app:${APP_IMAGE_TAG:-latest}` (previously
implicit/directory-derived). `scripts/deploy.sh` (new) tags each build with the git commit SHA,
refuses to run on a dirty tree (a SHA tag must mean something), retags `:latest`, and prunes builds
beyond the last 3 by actual build time (not tag string — git SHAs don't sort chronologically).
`scripts/rollback.sh <tag>` (new) switches back via a plain `docker compose up -d app` — no rebuild —
falling back to `git checkout` + redeploy only if that tag was already pruned. Explicitly documents
what it does NOT do: roll back the database if the target predates a migration that already ran.

**5. No pre-migration safety net.** `prisma migrate deploy` ran directly against production with only
the *daily* `backup` service dump as a margin — up to a day of changes at risk if a 2pm migration
went bad and needed a restore. `scripts/migrate.sh` (new) takes an immediate `pg_dump | gzip` snapshot
into `./backups/pre-migration/` (separate directory, own 10-snapshot retention — a safety net around
one action, not a long-term archive) *right before* running `migrate deploy`, and refuses to proceed
if the snapshot came back empty.

**6. No capacity/growth tracking.** `audit_log`/`financial_transaction`/`payment_allocation` are
append-only by design (correct, for audit integrity) but nothing tracked their growth rate —
`check-health.sh`'s 85%-disk-used check is reactive, not predictive. `scripts/capacity-report.sh`
(new) snapshots row count + `pg_total_relation_size` for all 14 tables (from `schema.prisma`'s
`@@map` names) plus total DB size, appended to `./backups/capacity-log.csv` — open it in a
spreadsheet to see the trend. Recommended weekly via the same cron mechanism as
`offsite-sync.sh`/`check-health.sh`.

**Verification, all live against real infrastructure (not just read):** the exact `pg_dump | gzip`
pipe and `prisma migrate deploy` (6 migrations) were run against a disposable Postgres container
seeded with this project's real schema; every one of `capacity-report.sh`'s 14 per-table queries plus
the database-size query were run against that same container and resolved correctly; `deploy.sh`'s
prune-by-creation-time logic was tested against 5 dummy tagged images with staggered build times
(correctly kept the 3 newest + `latest`, removed the 2 oldest); `docker compose config` confirmed the
new `image:` key resolves to `notary-accounting-app:latest` by default. **Deliberately not verified**:
an actual `docker compose up -d`/`rollback.sh` cycle against this project's own `app` service — this
session found an already-provisioned `db_data`/`attachments_data` volume in the checkout and couldn't
confirm whether it belonged to an active deployment, so it avoided cycling the real `app` container
rather than risk disrupting something in use. Run `sh scripts/deploy.sh` once by hand and confirm
`/api/health` before relying on it for a real rollback.

0 schema/API/business-logic change. `docs/DEPLOYMENT.md` gained §13d/§13e/§13f (same
insert-before-§13 numbering approach as v38's §13a-c, to avoid renumbering §14) and §6/§1 were updated
to point at the new scripts.

## [v38] - 2026-08-14

### Added — 3 DevOps architecture-review findings closed: attachments-backup health signal, image digest pinning, CI pipeline

Follow-up to a DevOps architecture review (analysis-only, no changes) that flagged several
improvement opportunities ranked by effort/value. The three "quick win" items were picked and
implemented together:

**1. `attachments-backup` had zero failure signal.** The service (v15/v26) was a bare `while true`
shell loop with no error handling — a `tar` failing every single night (disk full, `/data`
unreadable) would leave the container `running` forever, indistinguishable from a working backup.
Same "ran" vs "actually worked" gap class as the v31 pg_dump-version bug, just undetected because
nothing ever checked this specific service. Fixed: the loop now writes a status file
(`/backups/.attachments-backup-status`, `OK <timestamp>` / `FAILED <timestamp>`) every iteration, and
a real Docker `healthcheck` requires both a recent file (< 26h) and `OK` content —
`scripts/check-health.sh` needed zero changes, it already surfaces any service's real Docker health
generically. Verified directly against busybox (Alpine's actual `find`/`grep`/`touch`, not GNU
coreutils assumptions) for all 3 states: fresh+OK, fresh+FAILED, and stale-even-if-OK — all behave
correctly.

**2. All 5 images pinned by digest**, not just tag (`node:20-alpine` in all 4 Dockerfile stages,
`postgres:16-alpine`, `caddy:2-alpine`, `prodrigestivill/postgres-backup-local:16-alpine`,
`alpine:3`) — `image:tag@sha256:...`, tag kept for readability, digest authoritative. Closes a
reproducibility gap: a floating tag can silently resolve to a different build between two
`--no-cache` rebuilds months apart. Digests pulled and verified live in this session (not
hand-typed), each 64 hex characters confirmed. `docs/DEPLOYMENT.md` §13a documents the exact refresh
procedure (`docker pull` + `docker inspect --format='{{index .RepoDigests 0}}'`) since this is a
deliberate tradeoff — pinning trades automatic security-patch pickup for reproducibility, someone
has to remember to refresh it periodically.

**3. CI pipeline** (`.github/workflows/ci.yml`, previously nonexistent — every check this repo's
history describes as "verified" was run by hand, in this very session included). Code-quality gate
only, does not touch the deployment model (still manual/on-prem Compose, per `CLAUDE.md §6`). Two
jobs: `test` (lint → typecheck → full `vitest run` incl. `tests/scenarios` against a real
`postgres:16-alpine` GitHub Actions service container matching `db`'s actual version → `next build`)
and a separate `docker-build` job proving the Dockerfile itself still builds end to end — the layer
that has broken production twice before (v5 missing OpenSSL, v31 `npm install`/`npm ci` lockfile
drift) and that neither `next build` nor `tsc` alone would catch. Does not reuse
`scripts/reset-test-db.sh`'s `docker compose exec` pretest hook (assumes a docker-compose stack that
doesn't exist in a GitHub Actions runner) — writes its own disposable `.env.test` instead, since a
GH Actions service container is already a fresh empty DB every run.

All three verified live in this session: `docker compose config` resolves all 5 pinned digests
correctly, a full `docker build .` succeeds end to end with the pinned `node:20-alpine`, the
healthcheck command was tested against real busybox for all 3 states, and the new workflow YAML was
parsed (not just eyeballed) via `js-yaml` to confirm structure (2 jobs, 10 + 2 steps). The workflow
itself has not run on GitHub's runners yet (no push done in this session) — that's the one thing
still unverified.

0 schema/API/business-logic change. `docs/DEPLOYMENT.md` gained §13a/§13b/§13c (inserted before the
existing §13 Alerting to avoid renumbering §14 Off-Machine Sync, already referenced by v36/v37).

## [v37] - 2026-08-14

### Added — Settings > Backup & Recovery (read-only status UI)

Follow-up to v36: gives accounting staff and administrators visibility into backup health without
exposing infrastructure. Built from a detailed spec with explicit safety rules (no fake APIs, no new
backup engine, no invented "verified" status, no infra jargon in the UI) — two scope questions were
resolved with the user before implementation, both toward the safer/smaller option:

- **"Create Backup Now" is informational only** — no live trigger. The app container has no safe way
  to invoke the separate `backup` container's on-demand pg_dump without either Docker-socket access
  (root-equivalent host control, rejected as disproportionate) or running its own pg_dump (would add
  a second, differently-versioned dump path — the exact class of bug already found and fixed in
  v31). The button opens a panel showing the real last-backup timestamp and explains that an
  off-schedule dump is an administrator action on the host.
- **Secondary/off-site backup status is a static, honest label**, not a fabricated real-time status —
  `scripts/offsite-sync.sh` runs on the host via cron and writes to a disk path the app container has
  no visibility into at all (not even via `.env`). Rather than bridging that (a new mount + a script
  edit just for a nice-to-have), the UI says plainly that this is checked at the server level.

**What IS real** (`src/lib/backupStatus.ts`, new): reads the same `./backups/db` and
`./backups/attachments` directories the `backup`/`attachments-backup` Compose services already write,
through a new **read-only** bind mount on the `app` service (`docker-compose.yml`,
`BACKUP_DB_DIR`/`BACKUP_ATTACHMENTS_DIR`) — genuine file mtimes/sizes, not invented data. Freshness
(`HEALTHY`/`WARNING`/`NOT_CONFIGURED`) reuses the exact 48h threshold `scripts/check-health.sh`
already applies to the offsite mirror (v36), rather than inventing a second number. Backup History is
a real listing of dump/tar files sorted by mtime, capped at 8 — not invented if the directories are
empty (shows "Belum ada riwayat backup..." instead). Restore verification is always shown as
honestly "Belum pernah diverifikasi" — this codebase has never run a restore against a real second
disk (same limitation recorded in v36), and the UI must not convert "configured" into "verified."

**Restore UX** (`src/components/BackupRecoveryActions.tsx`, new): treated as high-risk per spec — a
confirmation checkbox gate ("Saya memahami bahwa restore dapat mengganti data saat ini") before
anything else is shown, and what's shown after is the 11-step manual verification procedure
(create backup → isolated restore → verify DB/Client/Matter/Transaction/Invoice/Payment/login →
record timestamp) as documentation, not an executed action — no restore endpoint exists or was
created; running one against the live database the app itself is connected to, from inside the app,
was judged unsafe to fake and out of scope to build for real in this pass.

**Placement**: added under existing Settings (`src/app/(app)/settings/page.tsx`), NOT a new sidebar
item — Sidebar.tsx untouched, matching the explicit instruction that backup is an operational
safeguard, not a daily accounting workflow. No admin/accountant UI split — confirmed against
`src/lib/session.ts`/`requireSession.ts` that this app has no role/permission model at all (flat
staff+PIN), so gating by role would have been invented, not reused.

0 schema change, 0 new endpoint (no API route was needed — status is read server-side by the
Settings page itself, same pattern as `getBrandingSettings()`), 0 business logic change. 17 new unit
tests for `src/lib/backupStatus.ts` (`tests/unit/backupStatus.test.ts`) using real temporary
directories (not mocked fs) — 129/129 total unit tests pass. `tsc --noEmit`, `next lint`, and
`next build` (41 routes) all verified clean via a disposable `node:20-alpine` container (no Node/npm
on this sandbox's host PATH) — `docker compose config` also confirmed the two new read-only mounts
resolve correctly. Not live-verified against a running deployment in this session.

## [v36] - 2026-08-14

### Added — Automated off-machine backup sync to a second internal disk

Follow-up to a deployment/DR review (`CLAUDE.md §8` v31, v15): `docs/DEPLOYMENT.md` §5 already
flagged that `./backups/db/` and `./backups/attachments/` sit on the *same physical disk* as the
live database — a disk failure loses live data and backups together — with only a manual, undated
"copy to USB weekly" mitigation. Confirmed with the office that the intended second device is an
always-mounted second internal disk in the same server (not a periodically-connected external
drive), which changes the design considerably — no on-connect detection needed, a plain host-level
cron job is sufficient.

**`scripts/offsite-sync.sh`** (new) — runs on the host, not in a container: the backup files already
land as plain files on the host filesystem via the existing `backup`/`attachments-backup` bind
mounts, so no Docker access is needed to move them (reuse-before-build, `CLAUDE.md §7.6`). Three
decisions worth recording:
- **No `rsync --delete`.** A 1:1 delete-mirroring sync would propagate a bad event on the source
  (accidental `rm`, a bug, ransomware) straight onto the one copy meant to survive it. The mirror
  only accumulates and is pruned on its own independent 90-day retention (`MIRROR_RETENTION_DAYS`),
  well past the primary's 14-day daily window.
- **Mount-check guard** (`mountpoint -q`) before syncing — if the second disk ever fails to mount
  after a reboot, the target dir would still exist as an empty folder on the *root* disk; without
  this guard the script would "succeed" while silently writing onto the exact disk it's meant to
  protect against.
- **Disk-space guard** — refuses to sync (rather than partially write) if the target is critically
  full.

**`scripts/check-health.sh`** — extended with an opt-in staleness check (WARN if no file synced to
`OFFSITE_BACKUP_DIR` in the last 48h). Deliberately gated on that env var being set at all, so
deployments that haven't adopted this yet see zero change in existing output.

**`docs/DEPLOYMENT.md`** — new §14 with full setup runbook (fstab UUID mount, `rsync` install,
crontab entry, verification), and §5 reframed to point there while keeping the manual truly-off-site
copy guidance intact — this only covers *disk* failure, not the whole server chassis (fire/theft/
flood still needs the manual off-site copy, unchanged).

0 schema/API/business-logic change, 0 new dependency beyond `rsync` (standard package, host-level
only, not added to any Docker image), 0 `docker-compose.yml` change (no new service — a plain file
copy doesn't need one). Not live-verified against a real second disk in this session (no such
hardware available here) — same honesty convention as v29's TLS spec before its v30 live cutover;
flagged as the next step once the office's actual second disk is installed and mounted.

## [v35] - 2026-08-14

### Fixed — Critical: financialType set at transaction creation never created the backing Payment/Deposit/Disbursement row

Found live, through an accountant (Tami) reporting a payment she'd just entered wouldn't show up on
the Payments page or allocate to any invoice. Investigated directly against the running database
rather than guessing — confirmed the transaction had `financial_type = 'PAYMENT'` but **no
corresponding `payment` row at all**.

**Root cause**: `POST /api/transactions` (`createFinancialTransactionTx` in
`financialTransactionActions.ts`) accepted an optional `financialType` in the request body — used
by the "New Transaction" form's Financial Type dropdown — but only ever wrote the label onto the
`financial_transaction` row. The actual `Payment`/`Deposit`/`Disbursement` child record — the thing
`/payments`, `position.ts`, and allocation all actually key off — was only ever created by
`transactions/[id]/classify/route.ts`. Any transaction created with a non-"belum diklasifikasi"
Financial Type picked *at creation time* (rather than left unclassified and classified afterward)
ended up permanently broken: invisible to `/payments`, unallocatable, and with **no way to fix it
from the UI** — the classify panel only renders when `financialType === "UNCLASSIFIED"`, so once
broken this way there was no reclassify path either. `payments/[id]/correct/route.ts`'s own header
comment already documented this exact invariant ("financial_type = 'PAYMENT' must always be backed
by a `payment` row") and had manually worked around it for its one call site — the gap was that
`POST /api/transactions` never got the same treatment.

**Fix** — `src/lib/financialTransactionActions.ts`:
- New `assertFinancialTypeDirection()` — the DEPOSIT/PAYMENT-must-be-IN, DISBURSEMENT-must-be-OUT
  rule, extracted from `classify/route.ts` so every entry point enforces it identically. `POST
  /api/transactions` never validated this combination at all before this fix — a second latent bug
  (direction/type mismatch would previously have silently written a mismatched, permanently-stuck
  row instead of erroring).
- New `createClassificationRecordTx()` — the actual Payment/Deposit/Disbursement-plus-audit-log
  creation, extracted from `classify/route.ts`'s inline PAYMENT/DEPOSIT/DISBURSEMENT branches.
- **3 call sites now share these** instead of 2 diverging copies: `classify/route.ts` (refactored,
  behavior-preserving), `payments/[id]/correct/route.ts` (refactored, replaces its hand-written
  workaround with the shared helper), and `POST /api/transactions` (the actual fix — now validates
  direction and creates the child record inside the same `$transaction` as the insert, atomically).
  `createFinancialTransactionTx` itself deliberately left untouched (still only inserts the
  transaction row) — folding child-record creation into it directly would have double-created the
  Payment row at the `correct` route's call site, which already creates it as an explicit second
  step.
- **Data repair, not a schema change**: Tami's specific stuck transaction
  (`67f9faed-29f7-45db-beda-538df3f7f6b7`, Rp1.500.000) was repaired live by calling the
  now-fixed classify endpoint against it directly — created exactly the Payment row that should
  have existed originally, through the real application code path (proper audit log entry,
  `notes` documenting it as a bug backfill), not a raw SQL patch.
- Live-verified end-to-end: reproduced the exact bug first (`POST /api/transactions` with
  `financialType: "PAYMENT"` at creation → confirmed via direct DB query, no `payment` row created,
  matching what was found for Tami's transaction) — then reproduced again after the fix and
  confirmed the `payment` row now exists and the transaction appears in `GET /api/payments`. Test
  transaction voided afterward (not deleted, per the app's own immutability rule) to avoid leaving
  noise in real data. Full suite re-run: 160/160, 0 regression, including a clean `prisma migrate
  deploy` from zero.
- Deployed via the same build-first-then-swap sequence as `v31`-`v34` — confirmed `200` on
  `localhost:3000` and the live public ngrok URL throughout.
- 0 schema change. `tsc`/lint clean (same 1 pre-existing unrelated `callApi.ts` error).

## [v34] - 2026-08-14

### Added — 6-item guide "painkiller" pass (contextual links, missing scenarios, skim/bridge UX)

Follow-up self-critique on `v32`/`v33`'s guide page, done explicitly as solution-analyst + UI/UX +
accountant-operations review before touching code: found the page was still "reference doc" not
"painkiller" (discoverable only if she remembers to navigate to it) and content-incomplete
(payment-only, no deposit/disbursement/CSV-import/bulk-action mention). All 6 findings implemented
in one pass, user directed "implement semuanya langsung."

- **Contextual "(?)" links, Dashboard → guide** (`src/app/(app)/page.tsx`) — the single highest-
  leverage fix: each `NeedsAttention` row now has a small "?" linking to `/guide#<category>`,
  reusing the same in-context-help philosophy as `FieldHelp`(v19)/`CalculationExplain`(v21) rather
  than new infrastructure. Required restructuring the row from one full-row `<a>` into two sibling
  links (main row → filtered list, "?" → guide) since nested `<a>` tags are invalid HTML and would
  have created competing click targets.
- **Contextual link, Review Center → guide** (`src/app/(app)/review/page.tsx`) — one line under the
  page description pointing to `/guide#trace`, since "investigate a specific record" is most
  relevant exactly where she's looking at one.
- **Deposit + Disbursement scenarios added** (`SCENARIOS` in `guide/page.tsx`, 6→8) — the original 6
  were 100% incoming-payment scenarios; a real operational guide needs the money-out side too.
  Content grounded in existing `FIELD_HELP.deposit`/`depositUsed` copy and the `BankAccount`
  disbursement model (v18), not invented.
- **CSV Import + bulk-select mentioned** (`STEPS` step 4 gets a `secondaryHref` to
  `/transactions/import`; `ATTENTION`'s Unlinked `action` text now mentions the checkbox/bulk-assign
  flow) — both were real, already-shipped features the guide previously never referenced, leaving
  an accountant with many rows to process unaware of the faster path.
- **"Ringkasan 30 detik" (TL;DR)** — 4 bullets above the quick-jump chips for someone who wants the
  gist without reading every accordion section; doesn't force deep-readers to scroll past it either.
- **"Situasi kamu sekarang" live strip** — `getDashboardSummaryCards()` (same call `page.tsx`
  already makes, 0 new query) rendered as small tone-colored chips with her actual current counts,
  linking to the real filtered views — bridges the generic Rp10.000.000 examples to her real data
  instead of leaving her to do that translation herself. `GuidePage` is now an async Server
  Component to fetch this.
- Mobile responsiveness: reviewed by reading the resulting layout classes (all chip/badge rows use
  `flex-wrap`, no fixed pixel widths beyond small icon buttons) — **not verified on an actual
  device/browser**, no such tooling in this environment; flagged honestly rather than assumed.
- Live-verified all 6 items against the real running stack: logged in as a real seeded staff
  account, confirmed the new copy/links present in `/`, `/review`, and `/guide`'s rendered HTML.
  Deployed via the same build-first-then-swap sequence as `v31`-`v33` — confirmed `200` on
  `localhost:3000` and the live public ngrok URL throughout.
- 0 schema/business-logic change (guide/dashboard/review are read-only presentational changes).
  `tsc`/lint clean (same 1 pre-existing unrelated `callApi.ts` error). 0 new dependency.

## [v33] - 2026-08-14

### Added — "Cek Transaksi Tertentu" section on the workflow guide, closing the remaining gap from v32

`v32`'s guide page was reviewed against Tami's original question and found only half-closed: it
covered the general PATTERN ("overpayment usually means X/Y/Z") but not her more specific ask —
"menu apa yg tiba2 menyebabkan ini" for the one real Aug-12 transaction she actually clicked into.
That's a request to investigate a specific record, which this app already has a dedicated,
already-built tool for (Transaction Trace) — the gap was purely that the guide page never mentioned
it.

- **New section 4, "Nemu Kasus Spesifik? Cek Transaction Trace"** (`src/app/(app)/guide/page.tsx`,
  `TRACE_STEPS` + `TraceGuide()`, inserted between the scenario accordion and the closing
  principles, which shifted from section 4 to 5) — a 5-step numbered walkthrough: open the
  transaction/invoice's detail page, scroll to **Timeline**, read each event, watch for the
  auto-suggested **"Aksi:"** line on relevant events, cross-check **Relationships**/**Audit** in the
  same view. Labels are copied verbatim from `TransactionTraceView.tsx`'s actual `<h2>` headings
  ("Timeline", "Relationships", "Audit") — a senior-UX-driven decision: instructional copy must
  match on-screen labels exactly, not a paraphrase, or it adds confusion instead of removing it.
  Added to the quick-jump chip row (`#trace`, "Cek Transaksi Tertentu").
- Solution-analyst framing: this is presented as a *reusable skill* (investigate any specific
  record) rather than a one-off patch bolted only onto the overpayment scenario — the same "menu
  apa yg menyebabkan ini" question applies to any Needs Attention category, not just overpayment.
- 0 new feature — Transaction Trace/Timeline/`Aksi:` suggestion (`exceptionExplain.ts`) already
  existed; this only teaches, in the accountant's own words, that it's the answer to a question the
  general scenarios can't answer.
- Live-verified the same way as `v32`: logged in as a real seeded staff account, confirmed `GET
  /guide` returns `200` with the new section's copy present in the rendered HTML ("Cek Transaksi
  Tertentu", "Transaction Trace", "Aksi:", "Relationships", "Audit" all found). Deployed via the
  same build-first-then-swap sequence — old container kept serving through the ~19s build, single
  recreate recovered within seconds, confirmed `200` on `localhost:3000` and the live public ngrok
  URL throughout.
- 0 schema/API/business-logic change, 0 new dependency. `tsc`/lint clean (same 1 pre-existing
  unrelated `callApi.ts` error).

## [v32] - 2026-08-14

### Added — Static "Panduan Alur Kerja" (workflow guide) page

Triggered directly by the office accountant (Tami) saying she felt "pusing" (overwhelmed) by the
Dashboard's Needs Attention items appearing without understanding why — a plain-language,
conversational explanation was given first (not a code change), then this page was built as the
durable, always-available version of that same explanation, once she confirmed a page was enough
and a full popup/coachmark tour was NOT needed (that option was explicitly proposed and rejected —
see reasoning below).

- **`src/app/(app)/guide/page.tsx` (new)** — three sections: (1) a 7-step vertical timeline from
  Client/Matter creation through to an invoice being paid off, each step linking to the real page
  that does it; (2) an accordion (native `<details>/<summary>`, zero JS/dependency, keyboard and
  screen-reader accessible for free) explaining all 6 Dashboard "Needs Attention" categories —
  content, tone colors (danger/warning/default), and hrefs copied to exactly match
  `src/app/(app)/page.tsx`'s `NeedsAttention` component so this page can never contradict what she
  actually sees; (3) 6 worked scenarios with concrete Rupiah examples (order baru → belum bayar →
  bayar pas → bayar sebagian diizinkan/tidak diizinkan → overpayment → belum jelas linknya), each
  ending in a concrete "what to do" — the overpayment scenario is pre-expanded by default since
  that was her actual live example. Closes with a 4-point "Prinsip Penting" callout (system never
  auto-decides ownership, Review Required isn't an error, nothing blocks other work, nothing is
  hard-deleted).
- **Why not a full interactive tour** (popups pointing at live buttons across pages): considered
  and explicitly rejected before building anything — this app's UI has changed across 30+
  CHANGELOG versions, so per-button coachmark selectors targeting specific DOM elements across
  multiple routes would be the most maintenance-fragile thing in the codebase, for a need that
  presented once, not as a validated recurring pain. A static page reusing the app's existing
  design system costs a fraction of that and can be kept in sync by hand the same way every other
  piece of static copy here already is (`FIELD_HELP`, `EmptyState` text).
- **`src/components/Sidebar.tsx`** — new nav entry ("Panduan Alur Kerja", new `GuideIcon`) placed
  directly under Dashboard — first thing a confused/new user would look for, not buried under
  Administration.
- Live-verified end-to-end against the actual running stack (not just built): logged in as a real
  seeded staff account, confirmed `GET /guide` returns `200` and the rendered HTML contains every
  major section's copy (timeline steps, all 6 attention categories, all 6 scenarios, the closing
  principles). Deployed via the same build-first-then-swap sequence as `v31` — `docker compose
  build app` (old container kept serving throughout the ~18s build), then `docker compose up -d
  app` (single recreate, health recovered within ~4s) — confirmed `200` on `localhost:3000`,
  Caddy's `https://localhost`, and the live public ngrok URL throughout, consistent with `v31`'s
  "don't disrupt the accountant's active ngrok session" constraint.
- 0 schema/API/business-logic change. `tsc`/lint clean (same 1 pre-existing unrelated `callApi.ts`
  error). No new dependency.

## [v31] - 2026-08-14

### Added — 7-item infra/DevOps/DBA audit remediation (login lockout, backup restore verified, resource limits, log rotation, alerting decision, onDelete drift fixed, image reproducibility)

Closes every "High" and "Medium" item from a dedicated infra/DevOps/DBA audit conversation
(read-only pass, no file changed there) run against the state left by `v27`–`v30`. Same session had
real Docker access to the live deployment (`app`/`db`/`caddy`/`backup`/`attachments-backup` all
already running from `v30`'s cutover, ngrok tunnel active and in use for accounting-staff testing
throughout) — every item below was live-verified against the real running stack, not just built and
hoped for, sequenced specifically to protect that active ngrok connection.

**High:**
- **Login PIN lockout** (`src/lib/loginRateLimit.ts`, new; `tests/unit/loginRateLimit.test.ts`, 6
  new tests; `src/app/api/auth/login/route.ts`) — 5 failed attempts locks a staffId for 5 minutes,
  `429` with remaining-wait message, in-memory (no schema/dependency), keyed by staffId not source
  IP (robust to IP rotation, doesn't cross-lock staff sharing an egress IP). Live smoke-tested
  against a real seeded staff account: attempts 1–5 → `401`, attempt 6 → `429` with the exact
  lockout message; that account's lockout will clear naturally after 5 minutes (documented, not
  worth another restart to force-clear).
- **Backup restore verified — and a real bug found because of it** (`scripts/restore-drill.sh`,
  new). Non-destructive: restores into a scratch DB, drops it after, live DB never touched. First
  run **failed**: `backup`'s image (`prodrigestivill/postgres-backup-local`, unpinned `:latest`)
  bundled `pg_dump` 18 against a `postgres:16-alpine` server — `pg_dump` 18 emits `SET
  transaction_timeout = 0` (Postgres 17+-only), so every daily dump had been silently
  non-restorable despite completing without error. Fixed by pinning `docker-compose.yml`'s `backup`
  image to `16-alpine` (bundles matching `pg_dump` 16.10). Re-verified live end-to-end after the
  fix: fresh dump restored cleanly, real row counts confirmed against the scratch DB (3 staff / 16
  client / 26 matter / 86 financial_transaction / 367 audit_log).

**Medium:**
- **Resource limits + log rotation** (`docker-compose.yml`) — shared `x-logging` YAML anchor
  (10MB×3 files, one definition instead of five copies) on all 5 services; `deploy.resources.limits`
  per service (`db` 1GB/2cpu, `app` 1.5GB/2cpu, `caddy` 256MB/0.5cpu, `backup`/`attachments-backup`
  512MB/1cpu) — starting points, not measured against this office's actual hardware. Applied live;
  `db`'s recreate briefly interrupted DB connectivity (Prisma reconnected automatically, confirmed
  `app`/Caddy stayed `200` throughout via curl) but never touched the `app` container/port ngrok
  targets.
- **Alerting — explicit decision, not silence** (`scripts/check-health.sh`, new;
  `docs/DEPLOYMENT.md` §13). Decision: no email/SMS/cloud alerting — new external dependency +
  secrets, against `CLAUDE.md §4` non-goals for a single-office app with no dedicated IT. Middle
  ground: a zero-dependency script (container status + Docker healthcheck + host disk usage,
  OK/WARN output, non-zero exit) the office can run manually or schedule themselves.
- **`onDelete` drift fixed** (`prisma/schema.prisma`, `prisma/migrations/20260814180000_fix_ondelete_restrict/`
  new) — `ddl_notary_financial_control.sql` always documented `ON DELETE RESTRICT` for 9 optional
  FKs (`FinancialTransaction.client/matter`, `CostDetail.invoice`, `PaymentAllocation.invoice`, all
  5 `FinancialAttachment` relations), but `schema.prisma` never declared it, so Prisma's default
  (`SET NULL`) is what actually got applied back in the very first migration. Fixed the database to
  match the documented, traceability-correct intent (CLAUDE.md §7 constraint 4) instead of the
  other way around — hand-authored migration (no live DB to run `prisma migrate dev` against at
  schema-edit time), applied live via `prisma migrate deploy`, confirmed against
  `pg_constraint.confdeltype = 'r'` for all 9. Full test suite (160/160, incl. all DB-backed
  scenario tests) re-run from a **clean** `prisma migrate deploy` afterward — no regression.
  `FinancialAttachment`'s 5 physically-existing indexes (`idx_attach_*`) documented in-schema as
  deliberately NOT expressed via `@@index`: they're partial/filtered indexes
  (`WHERE x_id IS NOT NULL`), a syntax Prisma's schema DSL doesn't support as of the pinned version
  — declaring a non-partial `@@index` would misrepresent the real index and risk a future `migrate
  dev` replacing it with a larger, non-partial one.
- **Image reproducibility + bloat** (`Dockerfile`) — `deps`/new `prod-deps` stages now copy
  `package-lock.json` and run `npm ci` (was `npm install` with no lockfile even present in that
  build context — dependency versions could silently drift between builds). New `prod-deps` stage
  (`npm ci --omit=dev`) feeds `runner`'s `node_modules` instead of `builder`'s full dev+prod tree;
  the generated Prisma client (written only into `node_modules/.prisma` by `prisma generate`,
  which needs the devDependency `prisma` CLI not present in `prod-deps`) is copied in separately
  from `builder`. Verified live: built successfully, confirmed `node_modules/.prisma/client`
  present and `typescript`/`vitest`/`eslint`/`tailwindcss` absent from the final image.

**Deploy sequencing (the "no ngrok downtime" constraint)**: non-`app` services (`backup`, `caddy`,
`attachments-backup`) were recreated first — zero impact on the port ngrok targets. `db`'s recreate
(config-only, resource limits) caused a ~20s connectivity blip that Prisma absorbed transparently.
`app`'s recreate (unavoidable — carries the rate-limiting code, the new migration file, and the
Dockerfile fix) happened once, bundling every app-level change into a single restart rather than
one per change; confirmed via `curl` against `localhost:3000`, `https://localhost` (Caddy), and the
live public ngrok URL (`https://<id>.ngrok-free.app/login`) that all three returned `200`
immediately after, with the public ngrok URL specifically checked as the accountant-facing
surface. `COOKIE_SECURE` unchanged (`v30`'s note still applies — staff browser CA trust distribution
still pending).

`tsc`/lint clean (1 pre-existing unrelated `callApi.ts` error, untouched). 160/160 tests (up from
154 at `v30`, +6 `loginRateLimit.test.ts` — the DB-backed scenario suite could finally be re-run for
real in this session, not just the unit subset). 0 API/route-shape change; 1 schema change
(`onDelete` only, no column/data change).

## [v30] - 2026-08-14

### Fixed — Caddy TLS cutover applied live; on-demand issuance bug found and fixed

`v29` added the `caddy` service but explicitly could not verify it live (no Docker in that
session). This session has real Docker access to the actual running deployment, so the cutover
was executed for real — `docker compose up -d` (applying the accumulated `v27`–`v29` changes:
`db` port rebind + restart policies + the new `caddy` service) — specifically because the ngrok
tunnel currently in use by accounting staff for testing points at `app`'s `3000:3000` mapping,
which needed to be proven to survive the recreation, not just assumed to.

- **Cutover applied**: `db` and `app` were recreated (config changed since last apply — port
  binding + `restart:`/`COOKIE_SECURE` respectively), `caddy` was created new. Total `app`
  downtime was ~20s (recreated → healthy), matching the "brief hiccup, not an outage" expectation
  set before running it. **Confirmed live**: `GET http://localhost:3000/api/health` and `/login`
  both returned `200` immediately after — the port the ngrok tunnel targets came back on its own,
  unchanged, exactly as the additive design intended.
- **Real bug found in `Caddyfile`, not caught by `v29`'s syntax-only `caddy validate` check**: the
  `:443 { tls internal ... }` block has no fixed hostname (by design — staff may reach the server
  by IP or LAN hostname), but Caddy's internal issuer refuses to auto-generate a certificate for an
  unrecognized SNI/IP unless on-demand issuance is explicitly enabled. Without it, every real TLS
  handshake failed with `TLS alert: internal_error` — `caddy validate` doesn't catch this because
  it only checks config *shape*, not runtime cert-issuance behavior. Found by actually attempting a
  handshake (from a throwaway `curlimages/curl` container on the Compose network, sidestepping an
  unrelated Windows-Schannel red herring that made the first host-side `curl` attempt equally
  fail with a misleading, unrelated error). **Fixed**: `tls internal { on_demand }` in `Caddyfile`.
  Left unrestricted (no `ask`/allowlist policy) since this is LAN-only, not internet-facing — no
  outside party can abuse on-demand issuance here.
- **Verified for real after the fix**, with proper certificate-chain validation (not `-k`
  skip-verify): exported the live CA (`docker compose exec caddy cat
  /data/caddy/pki/authorities/local/root.crt`, written to `office-root-ca.crt`, now
  `.gitignore`d — it's a public cert, not a secret, but instance-specific and regenerated whenever
  `caddy_data` is fresh) and used it as `--cacert` from a container on the Compose network:
  `https://caddy/login` and `https://caddy/api/health` both returned genuine, chain-verified `200`.
- **`COOKIE_SECURE` intentionally left at `"false"`** — not flipped in this pass. The remaining
  steps in `docs/DEPLOYMENT.md` §10's runbook (distributing `office-root-ca.crt` to each staff
  machine's OS trust store, verifying `https://<server-ip>` from an actual staff browser) require
  physical access to those machines, which isn't available from this session. Flipping
  `COOKIE_SECURE` before that would lock out any staff member still using the old
  `http://<server-ip>:3000` habit/bookmark, independent of the ngrok concern this pass was scoped
  to.
- 0 schema/business-logic change. `.gitignore`: added `office-root-ca.crt`.

## [v29] - 2026-08-14

### Added — TLS for LAN access (Caddy), session cookie `Secure` flag behind opt-in cutover

Closes the highest-value item deferred at `CHANGELOG.md` v27 ("TLS/HTTPS termination in front of
the app... cookie session & PIN login bisa disadap dalam radius WiFi"): the app was plain HTTP only
and the session cookie had no `Secure` flag, so on WiFi (not just wired LAN) the staff PIN and
session cookie were sniffable with nothing more than radio range and a weak/shared PSK — a captured
cookie is replayable for up to 12h (`SESSION_TTL_MS`) to impersonate that staff member, including in
the audit trail.

- **`docker-compose.yml` — new `caddy` service** (`caddy:2-alpine`), reverse-proxying to the app's
  existing internal port over the Compose network (`app:3000`). Deliberately additive, not a
  replacement: `app`'s own `"3000:3000"` mapping is untouched, because the temporary ngrok tunnel
  (`docs/DEPLOYMENT.md` §7) points directly at it and must keep working unchanged. `caddy` listens
  on a new port (`443`) instead. New `caddy_data`/`caddy_config` named volumes so its self-signed
  local CA (see below) survives restarts.
- **`Caddyfile` (new)** — `tls internal`, i.e. Caddy generates and serves its own local CA rather
  than requesting a public cert, appropriate since staff reach the server by LAN IP, not a public
  domain (no ACME/Let's Encrypt surface exists here). `:443` matches any Host header so it works
  for any LAN IP/hostname without hardcoding one.
- **`src/lib/session.ts`** — new `cookieSecure()` helper, reads `COOKIE_SECURE` env var (default
  `"false"`). **Not hardcoded to `true`** even though this pass adds the TLS front door: this
  sandbox has no Docker (`docker ps` → "command not found"), so the Caddy path could not be
  live-verified here. Hardcoding `secure: true` before an operator confirms `https://<server-ip>`
  actually works would silently drop the cookie on every plain-HTTP request and lock every staff
  member out of login — the same class of silent-failure bug as the v10 SESSION_SECRET incident.
  `docker-compose.yml`'s `app` service now passes `COOKIE_SECURE` through (same pattern as
  `SESSION_SECRET`/`DATABASE_URL`); `.env.example` documents the flag and the cutover condition.
- **`src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`** — both cookie
  set/clear calls now pass `secure: cookieSecure()` (previously omitted entirely). Login and logout
  use the same helper so the `Secure` attribute never mismatches between setting and clearing the
  cookie.
- **`docs/DEPLOYMENT.md` — new §10 "TLS for LAN Access (Caddy)"** — one-time setup runbook: bring
  up `caddy`, export its local root CA out of the container
  (`docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt`) and import it into
  each staff machine's OS trust store (manual, one-time per machine — no MDM/PKI automation, per
  `CLAUDE.md §4` non-goals), verify `https://<server-ip>` loads clean, **only then** set
  `COOKIE_SECURE=true` and recreate `app`.
- Verified in this sandbox: `tsc --noEmit` clean, `next build` clean (0 errors/warnings), lint
  clean (1 pre-existing unrelated error in `callApi.ts`, not touched by this change), 106/106 unit
  tests pass (`session.test.ts` specifically re-run), `docker-compose.yml` parses as valid YAML.
  **Not verified live** — no Docker in this environment, same limitation noted at v11/v15/v26; the
  `caddy` service itself, the cert-trust step, and the `COOKIE_SECURE=true` cutover all still need a
  real `docker compose up -d` + a staff-machine browser check before relying on them, per §10's
  runbook. 0 schema/business-logic change; API response shape unchanged (only response headers
  differ once behind Caddy).

## [v28] - 2026-08-14

### Added — Security headers, backup cadence, wired-server guidance (deployment review items #5–#7)

Continuation of the LAN/WiFi deployment architecture review (`CHANGELOG.md` v27 covered #2 and
#4). This pass closes the remaining low-risk, no-app-logic items from that review's findings list.

- **`next.config.js` (new file)** — the project had no Next.js config at all, so zero custom
  response headers. Added `headers()` applying `Content-Security-Policy`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a
  `Permissions-Policy` denying camera/microphone/geolocation/USB/payment (unused by this app).
  Verified safe to grep first: no `next/font`, `dangerouslySetInnerHTML`, external `<script>`
  tags, or external image/font URLs anywhere in `src/` — every resource is same-origin, so CSP can
  stay at `default-src 'self'`. `script-src`/`style-src` keep `'unsafe-inline'` deliberately: the
  App Router streams RSC payloads via inline `<script>` tags at runtime and several components use
  inline `style={{ }}` — a stricter nonce-based policy would need `middleware.ts` changes to mint a
  per-request nonce, not attempted here since there's no browser tooling in this environment to
  verify it live (same limitation as v13/v14/v25). **Verified via a real `docker build
  --target=builder`** (this project's documented build-verification method, since Node isn't
  installed in this sandbox) — build succeeded, all 40 routes compiled, config loads and merges
  correctly. Not verified in an actual browser — flagged honestly, same as the CSP caveat above.
- **`docs/DEPLOYMENT.md` §5 (Backup)** — the existing "copy `./backups/` off-machine periodically"
  guidance had no concrete cadence or verification step, which is a known failure mode for unowned
  manual tasks (quietly stops happening). Added: recommended weekly cadence (matches the backup
  service's 14-day retention, so a missed week doesn't fully exceed the safety margin), a reminder
  to copy both `db/` and `attachments/` subfolders (a partial copy is incomplete), a step to
  actually open/verify the most recent files rather than trust the copy dialog, and a note that
  this should be a named responsibility, not implicit. No code change — this was already correctly
  a manual, non-automated, non-cloud step per `CLAUDE.md §4`; only the instructions were vague.
- **`docs/DEPLOYMENT.md` §9 / `docs/SYSTEM_OVERVIEW.md` §6** — added explicit guidance that the
  office server itself should be Ethernet-wired even in an otherwise WiFi-only office: if the
  *server's* link is WiFi, every staff session degrades simultaneously on a bad signal; if only
  client PCs are on WiFi, one person's connection degrades, not everyone's. Operational guidance
  only, not enforceable in code.
- 0 schema/API/business-logic change. `docker build --target=builder` succeeded; `docker compose
  config` (from v27) still valid — `next.config.js` doesn't touch Compose.

## [v27] - 2026-08-14

### Fixed — LAN/WiFi deployment hardening (Postgres exposure + no restart policy)

Motivation: a deep-dive review of the deployment topology (prompted by "is this deployment model
good enough for a LAN-or-WiFi-only office, or can it be improved") found two concrete gaps in
`docker-compose.yml` unrelated to the app/schema itself — both fixed directly, no application code
touched.

- **`db` port mapping changed from `"5432:5432"` to `"127.0.0.1:5432:5432"`.** The app container
  already reaches Postgres over the internal Compose network (`db:5432`); the previous unbound
  publish left the database directly reachable from any device on the office LAN/WiFi, not just
  the app — unnecessary exposure with no offsetting benefit (host-side debugging, the only actual
  use case, still works via localhost). `docs/SYSTEM_OVERVIEW.md`'s auth model already stated the
  system "assumes a trusted LAN"; WiFi weakens that assumption more than wired LAN does, since
  reachability requires only radio range, not physical/switch access.
- **`app` and `db` now have `restart: unless-stopped`.** Previously only the `backup`/
  `attachments-backup` services had a restart policy — a host reboot or power blip left the app and
  database down until someone manually ran `docker compose up -d`, with no dedicated on-site IT
  staff to notice.
- `docs/DEPLOYMENT.md`: new §9 "Network Exposure & Restart Policy" documenting both changes and the
  rationale, including the alternative of removing the `db` port mapping entirely if host-side DB
  access is never actually used.
- Not done in this pass (flagged during the same review, deliberately left as separate, larger
  decisions rather than bundled in): TLS/HTTPS termination in front of the app (the highest-value
  remaining item for a WiFi deployment — currently plaintext HTTP, so the session cookie and login
  PIN are sniffable within WiFi radio range), login rate-limiting/lockout (staff list is
  intentionally public for the login picker, and PIN attempts are currently unlimited), and basic
  Next.js security headers (no `next.config.js` exists yet). See the architecture review discussion
  for the full findings list and severity ranking.
- 0 schema/API/business-logic change. `docker compose config` validated clean.

## [v26] - 2026-08-13

### Added — Disbursement by Bank Account summary (Painkiller #10 — "Tracking payment pihak
ketiga", score 3)

Motivation: closes pain point #10 from `CLAUDE.md §2`'s validated discovery table ("Tracking
payment pihak ketiga," score 3/10). `BankAccount` (the lookup table) and
`Disbursement.bankAccountId` (the nullable FK) already existed since `CHANGELOG.md` v18/FR-15, but
nothing answered the question staff actually have: "berapa total yang sudah dikeluarkan lewat
rekening X ini, across matters?" — the Disbursements list only ever showed the bank account
per-row, never summed. Closed as a pure aggregation over existing data, zero schema/migration
change.

- `src/lib/listAggregates.ts` (existing file — per `docs/REPOSITORY_STRUCTURE.md`'s documented
  split, `dashboard.ts` covers Dashboard-page aggregates and `listAggregates.ts` covers list-page
  aggregates, already housing `getClientListWithAggregates`; extended rather than adding a new
  file): new `getDisbursementSummaryByBankAccount()` — fetches ALL disbursements (deliberately
  uncapped; `Disbursement` has no `amount` column of its own, it lives on the related
  `FinancialTransaction`, so this can't be a Prisma `groupBy` through the relation — same
  fetch-then-reduce-in-memory shape already used elsewhere in this file/`dashboard.ts`), reduces
  into per-bank-account `{ bankAccount, total, count }` via `Prisma.Decimal` summation, sorted by
  total descending. Disbursements with no `bankAccountId` recorded (nullable FK, common for
  pre-v18 rows) fall into a sentinel `UNASSIGNED_BANK_ACCOUNT_KEY = "none"` bucket, surfaced
  honestly as "Belum ada rekening tercatat" rather than hidden or silently dropped.
- `src/app/(app)/disbursements/page.tsx`: new "Disbursement by Bank Account" summary Card above the
  existing table (sorted by total descending, `formatCurrency` formatting, same bank/account label
  convention as the existing table row). Each row links to `/disbursements?bankAccountId=<id|none>`
  — reuses the existing page via a query param, zero new routes. The page's own existing capped
  list query (`take: 150`) now also honors that same filter, with the `"none"` sentinel correctly
  translated back to `{ bankAccountId: null }` rather than a literal string match against the
  column. Active-filter state shows the resolved bank/account label with a "Tampilkan semua" clear
  link; `SortHeader` query params updated to preserve `bankAccountId` across sort-column clicks.
- `tests/scenarios/masterPromptScenarios.test.ts`: new `describe("Painkiller #10 —
  Per-bank-account disbursement summary aggregation")`, 2 tests — totals/count/sort-order across
  two real bank accounts, and the unassigned/"none" bucket.

### Added — "X of Y rows imported" headline on CSV Import result screen (Painkiller #18 —
"Transaksi tidak tertinggal", score 3)

Motivation: closes pain point #18 from `CLAUDE.md §2`'s validated discovery table ("Transaksi
tidak tertinggal," score 3/10). Review Center already catches WARNING/REVIEW_REQUIRED
transactions, but nothing flagged the coarser case of "the bank statement had 40 rows, only 35 got
imported." The numbers needed to say so (`rawRows.length`, `result.importedCount`) already existed
in `ExcelImportWizard.tsx`'s component state — they were just never combined into one headline.

- `src/components/ExcelImportWizard.tsx`: added a prominent block at the top of the "Import
  Selesai" result screen computing `skipped = rawRows.length - result.importedCount` — styled
  warning-toned when `skipped > 0` ("X dari Y baris berhasil di-import, Z baris di-skip — cek
  detail di bawah.") or success-toned when `skipped === 0` ("X dari Y baris berhasil di-import —
  semua baris masuk."). Explicitly not a new reconciliation engine — no new fetch, no new state,
  purely a presentational combination of two numbers the component already had. All pre-existing
  detail lines below it (failed-row/needs-review/invalid counts) are unchanged.

### Verified

- qa-agent independently re-verified (not just frontend-agent's own report): build and lint clean,
  full test suite green on a freshly reset Postgres test database. Test count re-confirmed directly
  in this documentation pass by counting test blocks in the working tree: 154 `it()` cases across
  15 test files, including the 2 new Painkiller #10 tests — consistent with qa-agent's reported
  154/154 passing run.
- The highest-risk claim in this change — whether the bank-account summary genuinely reflects ALL
  disbursements rather than being silently capped like the page's own `take: 150` list query — was
  proven against live data, not just by code reading: qa-agent inserted 200 real disbursements
  against one bank account into the test DB and confirmed `getDisbursementSummaryByBankAccount()`
  returned the correct full total (`count: 200`), while replicating the page's own `take: 150` list
  query in isolation would have under-reported by roughly 25% had it been used for the summary
  instead — confirming the uncapped-query design decision was correct and load-bearing, not a
  nice-to-have.
- The unassigned/"none" bucket was verified both by the new scenario test and by direct code
  reading confirming the sentinel-to-`null` translation on the `bankFilterWhere` path in
  `disbursements/page.tsx`.
- Zero Prisma/schema/migration diff from this work — confirmed directly in this pass (`git status`
  shows `prisma/schema.prisma` as modified, but that diff is unrelated, pre-existing `BankAccount`
  work carried over from v18, not touched again here).

### Found during QA, not fixed here

`docker compose build app` currently fails (`invalid file request backups/db/daily/...` —
independently reproduced in this documentation pass) because
`backups/db/{daily,last,monthly,weekly}/notary_financial_control-latest.sql.gz` (populated by the
`backup`/`attachments-backup` services added in v15) are symlinks, and Docker's build context
cannot resolve symlinks; `.dockerignore` never excludes `backups/` at all. Did not block
verification here — build/lint/test were run against a directly-mounted container instead of
`docker compose build` as a workaround — but it's a real, separate infrastructure bug, unrelated to
this change's own diff. Logged as a new `docs/ROADMAP.md` Mid-Term item for `devops-agent`, not
fixed in this pass.

## [v25] - 2026-08-13

### Added — Printable Client/Matter Financial Report ("Laporan untuk Notaris")

Motivation: closes pain point #19 from `CLAUDE.md §2`'s validated discovery table ("Laporan untuk
notaris," score 3) and revisits `docs/PRD.md` FR-24, previously logged as
"Explicitly out of scope — no PDF report engine." The notary (office principal, not accounting
staff) had no way to get a clean printed/PDF summary of a Client or Matter's financial position —
`src/app/(app)/reports/page.tsx` was (and remains) only a links-hub to existing pages plus one CSV
export; there was zero printable output anywhere in the app before this change.

- `src/components/PrintReportButton.tsx` (new) — small client-island button (`variant="secondary"
  size="sm"`, printer icon matching this codebase's existing inline-SVG icon convention) that calls
  the browser's native `window.print()`. No PDF-generation library and no headless-rendering
  service were added — the browser's own "Save as PDF" option inside its print dialog is the
  entire PDF path, so FR-24 is now closed with 0 new dependencies. Carries `print:hidden` on itself
  so the button doesn't appear in the printed output.
- `src/components/FinancialPositionView.tsx` — `<PrintReportButton />` wired into the component's
  own existing title/status header row (not into the page-level `actions` prop), so it
  automatically appears on both Client Position (`clients/[id]/page.tsx`) and Matter Position
  (`matters/[id]/page.tsx`) — both already render through this one shared component, so no
  page-level changes were needed. Added a print-only header block (`hidden print:block`, the
  inverse of the `print:hidden` pattern used everywhere else on the page): "Laporan Posisi
  Keuangan" + a "Dicetak pada: {timestamp}" line via the existing `formatDateTime` helper.
  Wrapped the `FieldHelp`/`CalculationExplain` trigger *wrappers* inside `SummaryStat` with
  `print:hidden` (only the call-site wrapper — `FieldHelp.tsx`/`CalculationExplain.tsx` themselves,
  shipped in v19/v21, were not touched). Added `print:hidden` to the Timeline and Sources &
  Documents cards — both judged internal/operational (staff names, audit reasons, raw attachment
  links) rather than notary-facing financial summary content, so excluded from the printed report.
  - **What prints**: title/subtitle/status badge, the print-only date header, the KPI summary grid
    (values only — help/explain triggers hidden), the Matter Breakdown table (Client scope), and
    the Cost Detail / Invoice / Payment / Deposit / Disbursement tables including their existing
    TOTAL rows — all data already rendered by existing code, restyled via CSS only; nothing
    recomputed or newly fetched.
  - **What's excluded**: app shell chrome, all action/modal-trigger buttons, contextual-help and
    calculation-transparency triggers, Timeline, Sources & Documents.
  - **Bug caught during changelog review, fixed same session**: the print-only header's eyebrow
    line initially read `BRANDING_TEXT_DEFAULTS.branding_hero_eyebrow` (`src/lib/branding.ts`) — the
    compile-time *default* string — not the office's live, database-persisted branding setting. A
    customized eyebrow text would have shown correctly on Dashboard/Settings but not on the printed
    report. Fixed by adding `getBrandingSettings()` to the existing `Promise.all(...)` fetch in both
    `clients/[id]/page.tsx` and `matters/[id]/page.tsx` (one more parallel fetch, not a new
    round-trip pattern) and threading the live `branding_hero_eyebrow` value down as a new optional
    `FinancialPositionView` prop (`brandingEyebrow`, falling back to the compile-time default if
    ever omitted). `tsc`/`vitest` reconfirmed clean (154/154) after the fix.
- `src/components/AppShellClient.tsx` — added `print:hidden` to `<Sidebar>` and the header bar
  (search/lite-toggle/review-bell/user-menu). Fixed a real layout problem needed to make printing
  work at all: the shell's outer container (`h-screen`, flex), its flex-col wrapper
  (`overflow-hidden`), and `<main>` (`overflow-y-auto`) form a viewport-bounded scroll chain —
  without overrides, `window.print()` would only have captured whatever was currently scrolled into
  view on screen, not the full report. Added `print:block print:h-auto` / `print:overflow-visible`
  at each of the three ancestor levels so content sizes to its natural height and paginates
  normally across as many physical pages as needed.
- `src/components/Sidebar.tsx` — added an optional `className` prop (merged onto the existing
  `<aside>`) purely so the shell could apply `print:hidden` without an extra wrapper `<div>`.
- `src/app/globals.css` — added `@page { margin: 1.5cm; }` and a `@media print { tr { break-inside:
  avoid; } }` rule (stops a table row from being visually split across a page break) — the only new
  CSS, no new page-break framework or pagination library.

Explicitly out of scope / untouched: Prisma schema, migrations, any API route, `position.ts`
formulas, `FieldHelp.tsx`/`CalculationExplain.tsx` internals (only their call-site wrappers gained a
class), any office-letterhead/address settings field (doesn't exist, wasn't invented — the only
brand text reused was the existing `branding_hero_eyebrow` key, per the accuracy note above).

### Verified

- Implementation pass (frontend-agent): `tsc --noEmit` clean, lint clean (via `next lint --no-cache`
  — a pre-existing, unrelated root-owned `.next/cache` directory in this sandbox blocks the default
  invocation; worked around, not a code issue), `npm test` 154/154 (no new tests — pure CSS/
  presentation, nothing new to unit-test), `npm run build` succeeded (temporarily redirected
  `distDir` via a throwaway `next.config.js` to work around the same root-owned `.next` issue,
  removed afterward — confirmed not part of the diff).
- Independently re-verified directly (not just taken on the implementer's report): `tsc --noEmit`
  clean again, `npm test` confirmed 154/154 again (15 test files).
- **Real, explicitly-stated limitation, not glossed over**: no browser tooling exists in this
  environment, so `window.print()`/"Save as PDF" could not actually be triggered and visually
  inspected. Verification was by careful code review only — confirming every `print:hidden`/`hidden
  print:block` target is a real class on a real element (not a guessed name), confirming neither
  `FieldHelp` nor `CalculationExplain` render via a React portal (so a parent's `display:none`
  genuinely hides them rather than them escaping to `document.body`), and reasoning through the
  Tailwind v4 `print:` media-variant and the flex/overflow cascade by hand rather than from an
  actual rendered screenshot. This is the single most likely feature in this session's work to have
  a real visual defect (e.g. an orphaned page break, an element that doesn't hide as expected) that
  only a real print preview would catch — flagged clearly as the one item genuinely worth a human
  eyeballing the actual print preview before relying on it for a real notary handoff.
- No security-agent review run: judged not warranted — pure presentation/CSS, no new data exposure
  (shows only what the page already displays on screen), no auth/session logic touched.

## [v24] - 2026-08-13

### Added — Recent Client/Matter (Feature C, Operational UX Refinement)

Motivation: same "Operational UX Refinement" spec that produced v19–v23. Feature A ("What Happens
Next" toast feedback) and Feature B (keyboard-first UX) turned out to already be substantially
complete via the pre-existing v22 entry (`toastNextHints.ts`, `useModalFocusTrap.ts`) — verified in
this pass, not re-implemented, not touched. Feature C (Recent Client/Matter) was confirmed
genuinely unimplemented (grep for `recentClient`/`recentMatter`/localStorage-based selection
returned zero hits anywhere in the codebase before this change) and is the actual new work here:
staff who work the same handful of clients/matters repeatedly across many transactions in a row
shouldn't have to re-search for them every single time — without the system ever inferring or
auto-selecting ownership on their behalf. `CLAUDE.md §7` constraint 2 stays absolute: Recent is a
shortcut into the existing explicit-selection flow, never a decision the system makes.

- `src/lib/recentSelections.ts` (new) — pure, browser-only `localStorage` helpers:
  `getRecentClients()`, `recordRecentClient({id, name})`, `getRecentMattersForClient(clientId)`,
  `recordRecentMatter({id, matterName, clientId, clientName})`. Distinct key prefix
  (`notary:recentClients` / `notary:recentMatters`) so it can't collide with the existing
  `ui_lite_mode` cookie or session storage; never sent to the server. Stores `{id, label}` pairs,
  not bare IDs — deliberately, so "Recent: CV Bumi Persada" renders instantly with zero network
  round-trip (a bare-ID-only store would require a fetch on every picker open just to resolve a
  name, defeating the point). Capped at 5 items per list, most-recently-used first, de-duplicated
  on re-selection (moves to front instead of adding a second entry, refreshing the stored label on
  re-select). Every read/write wrapped in try/catch — corrupted JSON, disabled storage, or quota
  errors degrade to "show no recent items," never a crash. `tests/unit/recentSelections.test.ts`
  (new, 13 tests): cap-at-5, MRU reordering, dedupe-on-reselect with label refresh, per-client
  matter filtering, and storage-throws/corrupted-JSON graceful handling.
- `src/components/ui/Typeahead.tsx` — additive `recentOptions?: TypeaheadOption[]` prop. When
  present and the field is focused with an empty/short query (before real search results exist),
  renders those as a visually distinct "Recent" section (small `role="presentation"` header row,
  muted micro-copy — matching the existing section-label convention already used by
  `CalculationExplain.tsx`'s `ListBreakdown`/`FormulaRows`) instead of the empty-results state.
  Once the query passes the search threshold, normal live search results take over exactly as
  before. Recent options flow through the exact same `<li role="option">` / highlighted-index /
  Arrow-Down/Up/Enter/Tab/Escape keyboard code path as regular search results — no second keyboard
  model, no separate component.
- Wired into the two places in the app where a user actually picks a Client/Matter to link or
  create against:
  - `NewTransactionModal.tsx` — Client `Typeahead` gets `recentOptions` from `getRecentClients()`;
    `pickClient()` now also calls `recordRecentClient()`. The Matter field (a native `<select>`,
    since Matter is architecturally always scoped under an already-chosen Client — a deliberate,
    pre-existing cascading design, not restructured here) gets an `<optgroup label="Recent">` for
    that client's recent matters, populated via `getRecentMattersForClient()`; selecting a matter
    calls `recordRecentMatter()`.
  - `LinkDrawer.tsx` — same pattern: Client `Typeahead` recent options + `recordRecentClient()` in
    `pickClient()`; the Matter button list gets a small "Recent" label above that client's
    recently-used matters, with `recordRecentMatter()` called on `linkToMatter()`.
  - **Existing bug fixed at both call sites**, needed to make "selecting a Recent item does exactly
    what search-selection already does" actually true: both `Typeahead.onSelect` handlers resolved
    the picked option by looking it up in `clientResults`
    (`clientResults.find(r => r.id === opt.value)`) — but a Recent option was never a member of
    that array (which only ever holds live search results), so selecting a Recent client would
    have silently no-op'd. Fixed by constructing the `ClientOption` directly from the selected
    option (`{id: opt.value, name: opt.label}`), which is exactly equivalent for real search
    results too (the label is always the client's name) and is what makes Recent selection
    genuinely identical to normal selection rather than a second, subtly different path.
- **Known limitation** (client-side memory bound, not a bug — documented in the module's own
  comments): `getRecentMattersForClient()`'s underlying raw storage buffer holds up to 30 matters
  combined across ALL clients (not per-client keys) — the *displayed* per-client list is always
  still correctly capped at 5 and MRU-ordered, but a matter for a client not touched in a long
  time, among 30+ more-recently-touched matters from other clients, could eventually age out of
  the raw buffer.

### Fixed — Enter key silently did nothing in Payment→Invoice allocation (found during the Feature B keyboard audit)

`AllocateInline` (the Payment→Invoice allocation widget, `TransactionActions.tsx`) was a plain
`<div>` with an onClick-only Simpan button — pressing Enter after typing an allocation amount did
nothing, unlike every other data-entry form in the app (a real `<form onSubmit>`). Fixed by
wrapping it in `<form onSubmit>` (Simpan → `type="submit"`, Batal → `type="button"`). Allocation is
reversible via the existing `ReverseAllocationButton`, so the "destructive action must not fire on
Enter" exception that correctly keeps the 3 Void/Reverse/Correct modals as plain `<div>`s (v22's
deliberate choice, left untouched here) doesn't apply to this widget.

### Verified — Feature B (Keyboard-First UX) closeout audit, verification only

v22 built the focus-trap infrastructure but hadn't done a systematic per-form checklist pass; this
session did that pass and made no changes beyond the one fix above:
- **Tab order** — PASS. Zero `tabIndex` overrides exist anywhere in `src/`, so DOM order is tab
  order everywhere by construction.
- **Enter behavior** — PASS, after the `AllocateInline` fix above. The 3 destructive modals'
  deliberate non-`<form>` status was re-confirmed correct, not "fixed" into a form.
- **Table keyboard reachability** (Transactions/Payments/Invoices/Clients/Matters/Review) — PASS.
  Zero `<tr onClick>` or other non-semantic clickable elements found; every row action is already
  a real `<a>`/`<button>`/`<input>`.

### Explicitly out of scope

`src/lib/toastNextHints.ts` and `src/components/ui/useModalFocusTrap.ts` (v22) — confirmed already
complete against the spec, not touched. No schema, no migration, no new API endpoint (confirmed —
no new file under `src/app/api/`, no existing route modified). A 3rd Client/Matter picker exists —
`BulkLinkPanel` inside `src/components/BulkActionToolbar.tsx` (the Transactions page's bulk "Assign
Client/Matter" panel), using the same Typeahead + Matter `<select>` pattern — left untouched since
this task was explicitly scoped to exactly the 2 named call sites (`NewTransactionModal`,
`LinkDrawer`); logged as a candidate in `docs/ROADMAP.md`, not built speculatively.

### Verified

- Implementation pass (frontend-agent): `tsc --noEmit` clean, lint clean (via `next lint
  --no-cache` — a pre-existing, unrelated root-owned `.next/cache` directory blocked the default
  lint/build invocation locally; worked around for verification, confirmed no stray files left
  afterward via `git status`), `npm test` 152/152 (139 pre-existing + 13 new), `npm run build`
  succeeds.
- Independently re-verified directly (not just taken on the implementer's report): `tsc --noEmit`
  clean again, `npm test` confirmed 152/152 again (15 test files, up from 14).
- No DOM/browser testing tooling exists in this environment (documented limitation carried forward
  since v13/v14/v19/v20/v21/v22/v23) — keyboard/localStorage/visual behavior verified by code
  inspection and the new unit tests, not an actual browser session.
- No security-agent review run: judged not warranted — localStorage-only, browser-side, never
  transmitted to the server, no auth/session logic touched, no new endpoint.

## [v23] - 2026-08-13

### Added — Dashboard chart complementarity fix: Unlinked Backlog by Age + Financial Activity click-through

Motivation: triggered by a direct UX audit asking whether "Unlinked Transactions Trend" on the
Dashboard was over-engineering. The analysis concluded it wasn't over-engineered in *concept* — it
directly serves the single highest-rated validated pain point in `CLAUDE.md §2` (#5, "payment
belum jelas client/matter," 10/10) — but was poorly *executed*, and found two further,
cross-cutting problems while auditing all 4 Dashboard charts together.

- **Analysis findings** (recorded here since they motivated the fix, not just the fix itself): the
  Dashboard's 4 charts (Financial Activity Over Time — area, money flow; Review Distribution —
  donut, data-quality flags; Outstanding Invoice Aging — bar, AR risk; and the now-replaced
  Unlinked Transactions Trend — line) each answered a genuinely different question, so there was no
  conceptual redundancy to remove. Three real problems were found instead: (1) the old Unlinked
  Trend silently shared its `range` URL query param with Financial Activity's chart, whose own
  7/30/90 picker UI sits in a different grid row below it — an invisible, confusing coupling
  between two supposedly-independent widgets; (2) it was a hybrid of two incompatible chart types —
  filtered by *current* link status (a snapshot question) but bucketed by *original* transaction
  date within a rolling window (a trend question) — which read as actively misleading: a downward
  slope near "today" only meant recent transactions hadn't yet had time to accumulate backlog, not
  that anything was actually improving; (3) Financial Activity Over Time and the old Unlinked Trend
  were the only 2 of the 4 charts with zero click-through, against this codebase's own established
  pattern (Review Distribution and Outstanding Aging are both already clickable with a "Klik ...
  untuk lihat ..." caption) and `CLAUDE.md §7` constraint 4 ("every financial summary must be
  traceable to underlying records"). The user was asked and chose to fix both charts' drill-down
  gap in the same pass rather than scoping to just the Unlinked chart.
- **Constraint deliberately designed around**: `CLAUDE.md §7` constraint 2 makes UNLINKED a state
  that can be *permanent* by design — unlike an overdue invoice (older-and-unpaid is unambiguously
  bad), an old unlinked transaction is not automatically urgent; some are meant to sit unlinked
  forever, per the office's own rule of not claiming ownership until the client says so. This ruled
  out reusing `AgingBarChart`'s escalating green→amber→red-by-age color scheme for the replacement
  chart, which would have visually pressured staff toward forced identification — contradicting a
  hard constraint even though no code would technically force linking.
- `src/lib/dashboard.ts`: `getUnlinkedTrend(days)` replaced with `getUnlinkedBacklogAging()` — an
  un-windowed current snapshot of all currently-unlinked ACTIVE transactions, bucketed by age (0-7
  / 8-30 / 31-60 / >60 days), mirroring the existing `getOutstandingAging()` query/reduce shape
  exactly. `count` per bucket is the primary metric (avoids IN/OUT sign ambiguity, since unlinked
  transactions mix both directions); `totalAmount` is tooltip-only supplementary context. Every
  bucket uses one flat neutral amber (`#D97706`, the same tone already used app-wide for
  "unlinked," e.g. Needs Attention's warning dot) — confirmed by direct code read to be a single
  constant, not an escalating ramp.
- `src/components/charts/UnlinkedAgingChart.tsx` (new, replaces deleted `UnlinkedTrendChart.tsx`)
  — a bar chart sibling to `AgingBarChart.tsx`, deliberately kept as a separate small component
  rather than merged into a shared generic abstraction (axis semantics differ — count vs. currency
  — and this codebase's existing convention is small sibling chart components, not a forced shared
  base). Each bucket is clickable, navigating to `/transactions?linked=unlinked&dateFrom=X&dateTo=Y`
  using pre-existing, already-composable filter params — zero backend/route changes needed.
  Caption explicitly negates alarm framing: "Lama belum ter-link bukan berarti bermasalah —
  UNLINKED tetap valid" (confirmed present verbatim in the component).
- `src/components/charts/FinancialTrendChart.tsx`: added click-through — clicking the area chart at
  any date navigates to `/transactions?dateFrom=X&dateTo=X` for that date, via recharts'
  chart-level `onClick`/`activeLabel`. Data, axes, gradients, and tooltip are unchanged.
- `src/app/(app)/page.tsx`: wiring swapped to the new hook/component; the card is retitled
  "Unlinked Transactions by Age" with subtitle "Backlog belum terhubung client/matter,
  dikelompokkan berdasarkan usia — bukan indikasi urgensi." The `range` query param is no longer
  secretly shared between the two former "trend" charts — Financial Activity still drives its own
  7/30/90 picker, and the new chart is deliberately un-windowed. The card keeps its existing grid
  position (same row as Needs Attention); it now genuinely fits that row's actionable/clickable
  contract instead of being the one inert item in it.
- `tests/scenarios/masterPromptScenarios.test.ts`: new
  `describe("Dashboard chart refinement — Unlinked Transactions by Age")` with one test asserting
  bucket-boundary correctness (a transaction dated exactly 40 days old lands in the 31-60 bucket
  and only that bucket) and, critically, a cross-widget consistency invariant — the 4 bucket counts
  must sum to exactly `getDashboardSummaryCards().unlinked` (same underlying filter, two different
  read paths on the same Dashboard; this protects against them ever silently drifting apart).

### Explicitly out of scope

Prisma schema, migrations, auth/session, `review_status`/exception-rule computation, Review
Distribution and Outstanding Aging charts (both already clickable before this change, left
untouched) — none touched. Zero schema/API change.

### Verified

- qa-agent independently re-verified (not just frontend-agent's own report): build and lint clean,
  full test suite green on a freshly reset Postgres test database, plus targeted ad-hoc checks —
  bucket-boundary edges (transactions exactly 7/30/60 days old land in the correct bucket, no
  off-by-one), click-through date-range direction (no inverted range that would silently return
  zero results), and a direct code read confirming the color/copy constraint held rather than
  relying on the implementer's self-report — `getUnlinkedBacklogAging()`'s color is genuinely a
  single flat constant, not `AgingBarChart`'s escalating ramp, and no alarm-toned copy
  ("terlambat"/"bermasalah"/"urgent") exists anywhere in the new surface.
- This documentation pass independently re-confirmed the same specific claims by direct code
  reading (not re-running the suite): the `#D97706` flat-color constant, the caption text, the
  `onClick`/`activeLabel` click-through wiring on `FinancialTrendChart.tsx`, and that exactly one
  new test was added to `masterPromptScenarios.test.ts`. Consistent with the count carried forward
  since v22 (138/138), this adds 1, for 139/139 — this figure was not independently re-executed in
  this pass (no Node/Postgres available directly in this environment, per the limitation already
  documented since v5/v13/v14), stated plainly rather than implied as freshly re-run.
- **One non-blocking residual note surfaced by QA, not fixed here**: bucket-day-math normalizes to
  local server midnight while `transactionDate` is a UTC-represented `@db.Date` column, which could
  shift a boundary by up to a day depending on server timezone/time-of-day. This is a pre-existing
  pattern already shared identically by `getDashboardSummaryCards()`/`getOutstandingAging()` in the
  same file — not a new bug introduced by this change, and deliberately not fixed here (out of
  scope for this pass).

## [v22] - 2026-08-13

### Added — Success → Next Action toast feedback

Motivation: user-provided UX spec — after a successful create/classify/allocate action, staff
currently only see a bare "Berhasil" toast with no indication of what a sensible next step might
be, forcing them to already know the workflow by heart. This adds an optional, suggestive
next-step line (never imperative, never forced) to success toasts only, reusing the existing toast
primitive rather than introducing a new notification system.

- `src/components/ui/Toast.tsx` — `ToastItem` gained optional `next?: string` and
  `cta?: { label; href }[]`; `show()`'s signature is additive so every pre-existing 2-arg call site
  keeps compiling and behaving unchanged. Gated on `kind === "success"` only — error/info toasts
  never grow a next-line or CTA. Auto-dismiss extended from 5s to 8s specifically when a `next`/`cta`
  is present, so there's time to read and click before it disappears; plain messages keep the
  original 5s.
- `src/lib/toastNextHints.ts` (new) — four pure functions (`transactionCreateNextHint`,
  `classifyNextHint`, `linkToClientOnlyNextHint`, `allocationNextHint`) that centralize the
  copy-decision logic in Indonesian, deliberately suggestive tone ("jika sudah diketahui", never a
  command). Each function only offers a next step that's genuinely knowable at that point — e.g.
  never suggests allocating a DEPOSIT (allocation only applies to PAYMENT), never suggests linking
  to a Matter when the Client on record has zero matters. This keeps UNLINKED a valid, non-coerced
  state per `CLAUDE.md §7` constraint 2 — the hints nudge, they never claim or auto-select.
  `tests/unit/toastNextHints.test.ts` (new, 11 tests) covers every conditional boundary of all four
  functions.
- Wired into six create/mutate flows: transaction create, transaction classify, payment allocation,
  invoice create, client create, matter create. Payment allocation's CTA
  (`AllocateInline`, `TransactionActions.tsx`) gained a `showPaymentDetailLink` prop so the
  "Lihat detail payment" link only appears from Transaction Trace (a genuinely different page) and
  is suppressed on `/payments/[id]` itself (already the page being shown — a self-referential CTA
  would be noise).
- Deliberately **not** added to `LinkDrawer.tsx` (transaction linking): its existing inline
  "Linked to X [Undo]" pattern (chosen originally to avoid toast-stacking noise when staff process
  many Review Center rows back-to-back) was kept as-is, with an optional next-hint segment appended
  to that same inline message instead of converting it to a toast — this specific call was
  confirmed directly with the user rather than assumed.
- Deliberately **not** added to `AddCostDetailModal.tsx` (cost detail create) or
  `ReverseAllocationButton` (allocation reversal): both would only ever be able to link back to the
  page already on screen, so they keep a plain success toast with no next-line.
- **Bug fixed along the way**: `CreateClientForm.tsx` called `toast(...)` immediately followed by
  `window.location.reload()` — the reload wiped the toast before it could ever render, so client
  creation never actually showed a success message. Replaced with `router.refresh()`, matching the
  already-correct sibling `CreateMatterForm.tsx` pattern, and wrapped the form in `<form>` for
  Enter-to-submit consistency with the rest of the app.

### Added — Keyboard-first workflow (focus trap + focus-visible fix)

Motivation: same UX spec, second half — modals/drawers across the app had no consistent
keyboard-trap/Escape/focus-return behavior (each one duplicated its own raw overlay div), and a CSS
bug was silently suppressing the app's own focus-visible ring on every input.

- **Real app-wide bug fixed**: `src/app/globals.css` had `.input:focus { outline: none; }`, which
  overrode the otherwise-correct global `:focus-visible` ring for every input/select/textarea in
  the app — keyboard users got no visible focus indicator on any form field. Split into a plain
  `:focus` rule (border-color only, so mouse clicks stay quiet) and a `:focus-visible` rule
  (border-color + visible ring, keyboard-only per the pseudo-class's own semantics) — restores
  visible focus indicators app-wide without adding a ring on mouse clicks.
- `src/components/ui/useModalFocusTrap.ts` (new) — a small shared hook, not a new dependency or
  framework: traps Tab/Shift+Tab at the panel boundary, focuses the first focusable element on
  open, returns focus to the trigger element on close. Its Escape handler checks for an open
  `[aria-expanded="true"]` descendant first — an attribute `FieldHelp` (v19), `CalculationExplain`
  (v21), and `Typeahead` already set on their own trigger while open — and yields to that instead
  of closing the modal, so one Escape press closes only the innermost open thing, never the wrong
  one. Applied to all 9 previously-unmanaged modal/drawer overlays that each hand-rolled a raw
  `fixed inset-0 z-50` div with no trap/Escape/focus-return logic at all: `AddCostDetailModal`,
  `CreateInvoiceModal`, `NewTransactionModal`, `CreateMatterForm`, `UploadDocumentModal`,
  `LinkDrawer`, `GlobalSearch`, and 3 separate modal blocks inside `TransactionActions.tsx`
  (Void/Reverse/Correct).
- Deliberately did **not** wrap the 3 destructive modals in `TransactionActions.tsx`
  (Void/Reverse/Correct — each has a reason textarea plus a destructive primary button) in
  `<form>`, specifically to avoid Enter-in-textarea accidentally submitting a void/reverse/correct
  action — verified safe as-is (Enter in a plain `<textarea>` only inserts a newline, it does not
  submit a form it isn't inside).
- `GlobalSearch.tsx`: removed its old manual `setTimeout(..., 50)` focus-on-open hack (superseded
  by the hook) and removed its own Escape-close branch from its existing window-level keydown
  listener (the pre-existing ⌘K-open branch was left untouched).
- Explicitly **not** implemented: any global keyboard-shortcut/command-palette system, and
  GlobalSearch "Enter jumps to top result" — skipped because result priority across the 5 different
  result categories is genuinely ambiguous, not something to guess at; logged instead as a
  `docs/ROADMAP.md` candidate.

### Fixed — Allocate Payment silently 404ing from Transaction Trace (pre-existing bug, found incidentally)

`TransactionTraceView.tsx` was passing `FinancialTransaction.id` as `AllocateInline`'s `paymentId`
prop instead of the actual `Payment.id` (a separately-generated UUID per `prisma/schema.prisma`) —
every "Allocate Payment" attempt made from the Transaction Trace page (`/transactions/[id]`)
silently 404'd, because `POST /api/payments/[id]/allocate` does
`prisma.payment.findUnique({ where: { id: params.id } })` and throws `NOT_FOUND` on a
`FinancialTransaction.id`. The same widget worked correctly from `/payments/[id]`, which already
had the real `Payment.id` from its own route param. This predates this session — it was introduced
when `AllocateInline` was first wired into Transaction Trace in v20 — and is unrelated to either
objective above; found while touching this component for the toast work. Fixed by exposing the
real id on the existing read model instead of inventing a new fetch: `src/lib/trace.ts`'s
`buildTransactionTrace()` now returns `paymentId: transaction.payment?.id ?? null` on the
`nodes.classification` object (the value was already being loaded via the existing Prisma
`include` for an unrelated purpose — trace never returned it), and `TransactionTraceView.tsx` now
gates on and passes that real id instead of `transaction.id`. Zero schema/API/migration change — a
read-model field that was already being fetched, just never exposed. Proven with a new regression
test in `tests/scenarios/masterPromptScenarios.test.ts` that classifies a real transaction as
PAYMENT, asserts the old path (`FinancialTransaction.id`) still 404s, and asserts the new path
(real `Payment.id`) succeeds with 201 — confirmed to fail without the fix and pass with it.

### Explicitly out of scope

Prisma schema/migrations, auth/session, the allocation/void/correct APIs' business logic,
`review_status`/exception-rule computation — none touched. The `schema.prisma` diff visible in
`git status` during this session is unrelated pre-existing uncommitted work from earlier the same
day, not part of this change.

### Verified

- `npm run build` (typecheck via Next.js build) PASS, `npm run lint` 0 warnings, `vitest run`
  138/138 passing (137 pre-existing + 1 new regression test) — `tests/scenarios/masterPromptScenarios.test.ts`
  now 45/45 including the new allocate-id test — run against a real Postgres test database via
  Docker, consistent with this repo's established verification approach since v5 (this environment
  has no local Node/Postgres).
- No DOM/browser testing tooling exists in this environment (documented limitation carried forward
  since v13/v14/v19/v21) — Toast rendering, CTA markup, and the focus-trap hook's actual
  keyboard/focus behavior were verified by thorough code review against the exact spec, not
  automated DOM tests or a real browser session. Stated plainly, not implied as fully proven.
- No security-agent review run: judged not warranted — presentation/UX-only change, no
  auth/session/access-control logic touched, no new data exposed or new endpoint added.

## [v21] - 2026-08-13

### Added — Calculation Transparency ("Bagaimana dihitung?")

Motivation: user-provided UX spec — accountants shouldn't have to wonder "angka ini asalnya dari
mana?" (where did this number come from) for the KPI totals shown on Client/Matter Financial
Position; this exposes the existing, already-correct calculation in a compact on-demand disclosure
rather than requiring Excel/manual recalculation/asking someone else.

- `src/components/ui/CalculationExplain.tsx` (new) — a "Bagaimana dihitung?" on-demand disclosure
  trigger, deliberately distinct from the Contextual Field Help "(?)" icon (v19): different
  question ("how was this number calculated" vs "what does this field mean"), different visual
  affordance (small text trigger, not an icon) — kept visually separate per explicit UX
  requirement not to merge them. Mirrors Field Help's accessibility interaction logic (native
  `<button type="button">` trigger, keyboard focus opens it, `aria-label`/`aria-expanded`/
  `aria-describedby` resolving to an always-in-DOM popover node, Escape + outside
  pointerdown/touchstart dismiss) as a second small self-contained implementation —
  `FieldHelp.tsx` itself was left untouched. One deliberate behavioral difference from Field
  Help: does NOT close on the trigger's own blur, because the popover content contains
  interactive drill-down links that must remain tab-reachable without the popover vanishing
  first. Also ships two small presentational helpers in the same file: `FormulaRows` (a 3-row
  subtraction display: minuend/subtrahend/result) and `ListBreakdown` (a capped
  contributing-record list with a "lihat tabel lengkap di bawah" link to the existing on-page
  anchor, plus an empty state like "Belum ada transaksi deposit." instead of a misleading blank
  formula).
- `src/lib/summaryDerived.ts` (new) — `computeAllocatedAmount(total, remaining)`, the single place
  `Total − Remaining` is computed for display purposes. Replaces two previously-separate inline
  expressions in `FinancialPositionView.tsx` (`allocatedToInvoices`, and a second one only ever
  computed inline at the Payment table's `<tfoot>` TOTAL row) with one shared calculation used in
  both places, so they can't silently drift apart. `tests/unit/summaryDerived.test.ts` (new, 4
  tests): confirms `Total Invoice − Allocated === Outstanding` and `Total Payment − Allocated ===
  Unallocated` reconcile exactly, plus fully-allocated and nothing-allocated edge cases.
- `src/components/FinancialPositionView.tsx` — wired `CalculationExplain` onto all 8
  Advanced-mode KPI tiles on Client and Matter Financial Position (both pages render through this
  one shared component, which is already the existing guarantee that the same metric means the
  same thing at both levels — nothing new needed there): Rincian Biaya/Total Cost, Total Invoice,
  Total Payment, Outstanding, Unallocated, Deposit Received, Deposit Used, Deposit Remaining.
  Applied uniformly to all 8 rather than a subset, so the KPI grid row stays visually even. Lite
  Mode tiles were deliberately left untouched (Lite Mode already intentionally omits this level of
  detail, per its existing v12 design).
  - Outstanding: `Total Invoice − Allocated = Outstanding`, "Allocated" row links to the existing
    `#invoices` anchor.
  - Unallocated: `Total Payment − Allocated = Unallocated`, links to `#payments`.
  - Deposit Remaining: `Deposit Received − Deposit Used = Deposit Remaining` — this formula was
    already shown on the page permanently visible (see Removed below); now it's the same formula,
    on-demand instead of always-on.
  - Total Invoice / Total Payment / Total Cost / Deposit Received / Deposit Used: each shows a
    capped list of the actual contributing rows already loaded on the page
    (`props.invoices`/`props.payments`/`props.costDetails`/`props.deposits`/`props.disbursements`
    — zero new data fetching, zero new API calls), each row linking to its existing detail route
    or anchor (`/invoices/{id}`, `props.linkHref("transaction", id)`, `#cost-detail`,
    `#deposits`, `#disbursements`) — no new routes were invented anywhere.
  - Deposit Used copy is deliberately honest about an existing data-model nuance: it reflects ALL
    disbursement transactions on the matter/client, not disbursements specifically traced back to
    a particular deposit (no such linkage exists in the schema) — the explanation says "seluruh
    disbursement," not a false per-deposit reconciliation story.
  - Every popover's headline result is always the exact `props.summary.*` value passed down from
    `src/lib/position.ts` (the single existing source of truth, untouched by this task) — never a
    frontend recalculation presented as authoritative; the breakdown numbers explain the existing
    figure, they don't replace it.

### Removed
- The standalone always-visible dashed-border "formula caption" box (and its `FormulaCaption`
  helper function) that previously showed 2 of these formulas permanently on Advanced mode — its
  content was absorbed into the new on-demand Outstanding and Deposit Remaining disclosures
  instead, so the same formula isn't shown in two places on the same page at once. This aligns
  with the explicit design requirement that KPI tiles shouldn't permanently display a formula by
  default.

### Known nuance (not fixed, correctly left alone as out of scope)
- On Client-scope Position pages, `props.payments`/`props.deposits`/`props.disbursements` only
  contain the "linked to client but not yet to a matter" bucket, while the tile headline number
  aggregates across all matters too — this mismatch already existed in the page's table `<tfoot>`
  totals before this task; the new popovers surface the same existing "belum ter-assign ke
  matter" caveat text rather than attempting a fix, since reconciling it would require new data
  plumbing, out of scope for an explanation-only layer over data already on the page.

### Explicitly out of scope
- Prisma schema, `position.ts` formulas, the allocation API, `review_status` computation,
  auth/session, Contextual Field Help (v19), Remaining Balance/Allocation Preview (v20) — none
  touched, none redesigned. Payment Detail page's own Amount/Allocated/Unallocated stat tiles were
  also explicitly left out of this pass (scoped to Client/Matter Position only, where all P0
  metrics already live together).

### Verified
- Implementation pass (frontend-agent): `tsc --noEmit` clean, `npm run lint` clean, `npm test`
  126/126 (122 pre-existing + 4 new), `npm run build` succeeds, all 40 routes generated.
- Independently re-verified directly (not just taken on the implementer's report): `tsc --noEmit`
  confirmed clean again, `npm test` confirmed 126/126 again (13 test files, up from 12).
- No DOM/browser testing tooling exists in this environment (documented limitation carried forward
  since v13/v14/v19/v20) — keyboard/accessibility behavior verified by code inspection only
  (native button trigger, correct `aria-*` wiring, popover content always in DOM so
  `aria-describedby` resolves), not an actual browser session. Stated plainly rather than implied
  as fully proven.
- No security-agent review run: judged not warranted, presentation-only, no auth/session/
  access-control logic touched, and every popover reuses the exact same data/authorization
  boundary already loaded for the page (no new data exposed beyond what the page already renders
  in its tables).

## [v20] - 2026-08-13

### Added — Remaining Balance & Allocation Preview

Motivation: user-provided UX spec — accountants currently need to do mental arithmetic (or open
another screen) to know how much of a payment is still allocatable and how much of an invoice
remains outstanding before/while entering an allocation amount. This surfaces both, plus the
consequence of the amount currently being typed, directly inside the existing Payment→Invoice
allocation workflow — framed explicitly as advisory/preview-only (never a committed state until
Simpan is clicked, never a frontend-invented business rule; the existing exception-rule engine
remains the sole authority on `review_status`).

- `src/lib/allocationPreview.ts` (new) — pure function
  `computeAllocationPreview(availablePayment, invoiceOutstandingAmount, proposedAmount)` returning
  `{ proposedAmount, paymentRemaining, invoiceRemaining, exceedsPayment, exceedsInvoice,
  exceedsPaymentBy, exceedsInvoiceBy }`. Deliberately plain `number` arithmetic, not Decimal.js —
  matches the existing `invoiceOutstanding()` helper already living next to it in
  `TransactionActions.tsx`, which does the same plain-number math over the same values, so the new
  preview can never disagree with the calculation it sits beside. `tests/unit/allocationPreview.test.ts`
  (new, 6 tests): normal allocation, exact allocation, payment over-allocation, invoice
  over-allocation, both exceeded simultaneously, boundary case.
- `AllocateInline` (`src/components/TransactionActions.tsx`, the existing Payment→Invoice
  allocation widget) extended with a live, local preview that updates as the user types — no
  network request per keystroke:
  - Selected-invoice breakdown line (Total invoice / Sudah dialokasikan / Sisa) — replaces the
    previous single "Sisa tagihan invoice: X" line (added in v18), which only showed outstanding,
    not the full breakdown.
  - "Setelah alokasi" live preview line (Payment tersisa / Sisa invoice), neutral/quiet styling
    when normal — no green success banner added just because the math is valid, per explicit
    instruction not to overdesign this.
  - Two independent, stackable, non-blocking warning lines using the existing `text-warning`
    class, each prefixed with the `⚠` character (not color alone — matches this codebase's
    existing non-color-only signaling convention, e.g. `ReviewStatusBadge`): one for exceeding
    available payment, one for exceeding invoice outstanding. Both can show at once. Neither
    disables the Simpan/submit button — allocation anomalies remain allowed to proceed and may
    surface as REVIEW_REQUIRED via the existing backend exception engine, exactly as before this
    change.
  - Empty/zero amount input shows no preview or warning block at all (only the invoice breakdown
    line) — avoids a misleading calculation from an incomplete/zero entry.
  - `invoiceOutstanding()` itself was left with its exact existing signature/behavior for all other
    callers; a small sibling `invoiceAllocatedSoFar()` was extracted so the new breakdown line and
    `invoiceOutstanding()` share one `.reduce()` instead of duplicating the sum.
- `AllocateInline`'s `unallocated` prop changed from a pre-formatted display string to a raw
  `number` — the component needed the actual numeric available-payment amount to compute the live
  preview, not an already-`formatCurrency()`-rendered string. Both of its 2 call sites updated:
  `src/app/(app)/payments/[id]/page.tsx` (was passing `formatCurrency(unallocated)` from a
  `Prisma.Decimal`, now passes `Number(unallocated)`) and `src/components/TransactionTraceView.tsx`
  (the value there was already a plain `number`; the `formatCurrency()` wrapping was dropped at the
  call site — the component formats it internally now via the same shared `formatCurrency` from
  `src/lib/formatCurrency.ts`, no second formatter introduced).
- Deliberately not duplicated inside the widget: Payment Amount / Already Allocated / Unallocated
  are already shown as page-level stat tiles directly above this widget on both call-site pages —
  the widget only surfaces what wasn't already visible (the selected invoice's own breakdown, and
  the new live "after this allocation" numbers that only exist once something's typed).

### Explicitly out of scope
- Prisma schema, migrations, the allocation API contract (`POST /api/payments/[id]/allocate`,
  `POST /api/payment-allocations/[id]/reverse`), `review_status`/`payment_status` computation,
  `allowPartialPayment` backend behavior, auth/session, and the Contextual Field Help feature from
  v19 — none touched, none redesigned. No new API route, no new dependency, no network request
  added anywhere in this flow — everything is derived synchronously from data already fetched when
  the widget opens plus local input state.

### Verified
- Implementation pass (frontend-agent): `tsc --noEmit` clean, `npm run lint` clean, `npm test`
  122/122 (116 pre-existing + 6 new in `allocationPreview.test.ts`), `npm run build` succeeds (exit
  0; pre-existing unrelated `DYNAMIC_SERVER_USAGE` build-log noise for API routes using
  `request.headers`, same as noted in prior entries).
- Independently re-verified directly (not just taken on the implementer's report): `tsc --noEmit`
  clean again, `npm test` confirmed 122/122 again (12 test files, up from 11).
- No DOM/browser testing tooling exists in this environment (documented limitation carried forward
  since v13/v14/v19) — keyboard/visual behavior verified by code inspection only; confirmed the `⚠`
  character is literally present in the rendered JSX string (not a CSS-only icon), not by an actual
  browser session.
- No security-agent review run: judged not warranted, this is a presentation/calculation-display
  change only — no auth/session/access-control logic touched, no data sent to the server differs
  from before.

## [v19] - 2026-08-13

### Added — Contextual Field Help

Motivation: a detailed UX spec for contextual, non-intrusive field help, sourced from a real
accountant interview clarifying concepts that had previously caused confusion (Cost Detail Amount
is billed-to-client, not actual office expenditure; Deposit is real client titipan, not just a
generic default mechanism; Unlinked is a valid state, not an error — the same findings already on
record in `CLAUDE.md §2`/v12).

- `src/components/ui/FieldHelp.tsx` (new) — a small (14-16px), muted-gray "(?)" affordance, the
  first Tooltip/Popover primitive in `src/components/ui/` (confirmed by inspection: none existed
  before this). Trigger is a native `<button type="button">` — naturally keyboard-reachable and in
  normal tab order, not a synthetic `<span onClick>` — with `aria-label`/`aria-expanded`/
  `aria-describedby` wired to the popover content. Opens on hover (desktop), keyboard focus, or
  tap/click (touch) — driven by React state, not CSS `:hover`-only, so touch devices work too.
  Escape and click/touch-outside dismiss. Popover is `position: absolute` (never shifts page
  layout), ~280px max-width, with a simple left/right viewport-edge heuristic so it doesn't render
  off-screen near the right edge.
- `src/lib/fieldHelp.ts` (new) — single `FIELD_HELP` object, the one source of truth for all
  tooltip copy (Indonesian, validated against the accountant-interview findings above, nothing
  invented). Prevents the string-duplication that had already crept in once (see Changed below).
- Applied to 6 confirmed P0 fields — all real, pre-existing form fields, nothing invented —
  placement adapted per control type rather than one fixed pattern:
  - **Inside the field**, trailing edge: Cost Detail Amount (`AddCostDetailModal.tsx`), Source
    Reference (`NewTransactionModal.tsx`'s `Typeahead` field, from the v16 autocomplete feature).
  - **Label-side**: Financial Type and Source Type (`NewTransactionModal.tsx`, both native
    `<select>`) — inside-control placement skipped because a native select's dropdown arrow isn't
    stylable, per the adaptive-placement rule.
  - **Adjacent-flex** (its own flex item next to the control): Allocation Amount
    (`TransactionActions.tsx`'s `AllocateInline`) — a narrow 120px input with no room and no
    separate `<label>` to attach to.
  - **After the label text, never touching the control**: Allow Partial Payment checkbox
    (`CreateInvoiceModal.tsx`) — checkboxes deliberately never get an inline icon on the control
    itself, per the interaction spec.
- Applied to 6 P1 fields (all implemented, none skipped):
  - Deposit — a new one-line "Classify as:" label (didn't exist before) added above the
    PAYMENT/DEPOSIT classify-button row in `TransactionActions.tsx`'s `ClassifyTransactionPanel`,
    since DEPOSIT is a button choice rather than a labeled input field.
  - Deposit Used and Invoice Total — wired into the `SummaryStat` tiles in
    `FinancialPositionView.tsx` (see Changed below for the component change this required).
  - Payment Amount — the "Amount" `Stat` tile on `src/app/(app)/payments/[id]/page.tsx`.
  - Link Status — added once, at the column header level in `TransactionsTable.tsx`, deliberately
    not on every per-row `LinkStatusBadge` instance across the app (to avoid visual noise/
    repetition) — badges themselves left untouched.
  - Review Status — added once, at the page-heading level on `src/app/(app)/review/page.tsx`, same
    reasoning as Link Status.
- Scope: exactly these 12 fields. Ordinary fields (Name, Date, Description, Search, etc.)
  deliberately stayed bare — "selective help, not documentation-everywhere" was the explicit
  principle behind this feature.

### Changed — `SummaryStat` consolidation
- While upgrading `SummaryStat` (`FinancialPositionView.tsx`) to accept `FieldHelp`, its
  pre-existing "Rincian Biaya" tile — which had an ad hoc native `title` attribute tooltip with
  wording near-duplicate of the new `FIELD_HELP.costAmount` — was consolidated onto the same new
  mechanism/copy, one source of truth instead of two similar strings.
- `SummaryStat`'s internal structure changed slightly: the help trigger is now rendered as a
  sibling of the tile's `<a>` link rather than nested inside it, to avoid invalid HTML (a
  `<button>` inside an `<a>`). Visual behavior — still a drill-down link, same `href`, same number
  formatting — is unchanged.

### Explicitly out of scope
- Prisma schema, migrations, financial formulas, `review_status`/`link_status`/`payment_status`
  computation, allocation behavior, auth, session, and every API request/response contract —
  untouched. Confirmed via `git diff --stat`: the files that do carry business logic/schema/API
  contracts in the current working tree (`prisma/schema.prisma`, `src/lib/position.ts`,
  `src/lib/trace.ts`, `src/app/api/**`) show diffs that predate this session (already present in
  `git status` before this conversation started — carried over from the v18 work) — none of them
  were touched specifically for this task.

### Verified
- Implementation pass: `tsc --noEmit` clean, `npm run lint` clean (aside from the pre-existing
  unrelated `callApi.ts` issue carried forward since v16), `npm test` 116/116, `npm run build`
  succeeds.
- Independently re-verified directly (not just taken on the implementer's report): `tsc --noEmit`
  clean again, `npm run lint` — same single pre-existing `callApi.ts` finding only, `npm test` —
  116/116 confirmed again.
- Test count: 116/116, unchanged from v18. No new automated test was added for this feature —
  consistent with it being presentation-only UI wiring (the same pattern as v16/v17, which also
  shipped 0 new tests for thin UI wiring over already-tested primitives). This is not a drop or a
  miscount: v18, landed the same day, had already moved the recorded count from 115 to 116; this
  feature didn't move it further in either direction.
- No DOM/browser testing tooling exists in this environment (documented limitation carried forward
  since v13/v14) — hover/touch/keyboard/viewport-edge behavior was verified by code inspection
  only: the native `<button>` trigger sits in normal DOM/tab order, `aria-*` attributes are wired
  correctly, popover content is always present in the DOM (not conditionally unmounted) so
  `aria-describedby` always resolves, and open/close is driven by React state rather than CSS
  `:hover`-only. This was not exercised in an actual browser session — stated plainly rather than
  implied as fully proven.
- No security-agent review run: judged not warranted, this change is presentation-only and touches
  no auth/session/access-control logic.

## [v18] - 2026-08-13

### Added — Roadmap items 1–4, implemented in parallel

Origin: `docs/ROADMAP.md` items 1–3 (near-term, raised directly by office accounting staff in the
2026-08-11 walkthrough) plus `PAINKILLER_COVERAGE_AUDIT.md` §7 item 4 (the allocation
remaining-balance polish that audit itself recommended but explicitly deferred — "Implement now:
No — not requested by this audit's scope"). Two of the roadmap items had open questions blocking
implementation; both were resolved directly with the office before any code was written: invoice
numbering is a per-year reset (`INV-2026-001` style, not continuous or prefix-by-matter-type), and
the office confirmed it uses a small, fixed set of bank accounts — settling `ROADMAP.md #3`'s
lookup-table-vs-free-text question in favor of a lookup table.

- **Sequential invoice numbering** (Roadmap #1, PRD FR-9): `GET /api/invoices?suggestNext=true[&year=YYYY]`
  returns `{ suggestedInvoiceNumber, year }`, built on `src/lib/invoiceNumbering.ts`'s
  `suggestNextInvoiceNumber()` (continues whatever `INV-{year}-{seq}` pattern is already
  established in the data, never invents a scheme) — previously client-side-only logic, now
  server-authoritative. `POST /api/invoices` additionally returns a `sequenceWarning` string
  (`checkInvoiceNumberSequence()`, non-blocking) when a manually-entered number breaks sequence for
  its year — a manually-entered out-of-sequence number still succeeds, per the acceptance
  criteria's explicit "manual entry isn't fully removed." `CreateInvoiceModal.tsx` wired to both:
  pre-fills the suggested number on open, toasts the warning after creation if one comes back.
  Existing invoices untouched — forward-looking only, no backfill/renumbering of history.
- **Clearer payment correction workflow** (Roadmap #2, PRD FR-12): new
  `POST /api/payments/[id]/correct`, a thin composition of the pre-existing void + create logic.
  That logic was extracted into shared helpers in new `src/lib/financialTransactionActions.ts`
  (`assertVoidable`, `voidFinancialTransactionTx`, `resolveInitialReviewStatus`,
  `createFinancialTransactionTx`) — the existing void route
  (`src/app/api/transactions/[id]/void/route.ts`) and create route (`src/app/api/transactions/route.ts`)
  were refactored to call these same helpers instead of their own inline logic, behavior-preserving
  and confirmed by their existing regression tests still passing unchanged. Void of the original +
  create of the corrected replacement (same client/matter/classification, staff-supplied new
  amount/date/description) happen atomically in one `prisma.$transaction`. No schema change: the
  old↔new link lives entirely in the audit trail — the VOID entry's `newValue` carries
  `correctedByTransactionId`/`correctedByPaymentId`, the CREATE entry's `previousValue` carries
  `correctsTransactionId`/`correctsPaymentId`. `TransactionTraceView.tsx` reads this back out and
  renders "Dikoreksi oleh →" / "Mengoreksi →" cross-links. UI: new `CorrectPaymentButton` in
  `TransactionActions.tsx`, wired into `src/app/(app)/payments/[id]/page.tsx`.
- **Allocation remaining-balance indicator** (`PAINKILLER_COVERAGE_AUDIT.md` §7 item 4):
  `AllocateInline` (`TransactionActions.tsx`) now shows "Sisa tagihan invoice: Rp X" live as staff
  pick an invoice, computed from an additive `include: { allocations: { where: { status: "ACTIVE" } } }`
  on `GET /api/invoices`'s default response. Purely informational — does not block or disable
  submit when the typed amount exceeds outstanding; this system's allocation rule is deliberately
  non-blocking (validated at Step 9, re-affirmed when Phase 3.4 was rejected in v9) and stays
  unchanged here.
- **Structured per-bank disbursement categorization** (Roadmap #3, PRD FR-15): new `BankAccount`
  model (`prisma/schema.prisma`, migration `20260812155645_add_bank_account`) — additive only,
  mirrors `Client`'s shape/status pattern (`bankName`, `accountName`, `accountNumber`, `status`
  ACTIVE/INACTIVE) rather than free-text `CostCategory`'s pattern, an explicit architect-agent
  decision since the office confirmed a genuinely fixed small set, unlike `CostCategory`'s
  deliberately-open taxonomy. New nullable `Disbursement.bankAccountId` FK, hand-edited to
  `ON DELETE RESTRICT` (not Prisma's default `SET NULL`) because `bank_account` deliberately gets
  no `prevent_delete()` trigger — `RESTRICT` is the only thing stopping a bank account still
  referenced by a disbursement from being removed. Immutable after classify, matching `category`'s
  existing no-edit-path convention (no PATCH/edit endpoint exists for `Disbursement` itself, before
  or after this change). New `/api/bank-accounts` (GET/POST) and `/api/bank-accounts/[id]`
  (GET/PATCH) routes. `audit_log.entity_type`'s CHECK constraint widened (additive, mirrored in
  `ddl_notary_financial_control.sql`) to allow `'BANK_ACCOUNT'`. UI: `ClassifyTransactionPanel`'s
  (`TransactionActions.tsx`) DISBURSEMENT path changed from an instant single-click button into an
  inline, optional bank-account `Typeahead` picker — PAYMENT/DEPOSIT stayed single-click, unchanged.

### Fixed — bank account never displayed (QA-caught, post-deploy)

QA caught a real gap after the disbursement-categorization item's initial deployment: the bank
account was persisting correctly (confirmed in the database and in the audit log's `CREATE`
snapshot) but was never shown anywhere in the UI — the read models only ever surfaced the raw,
invisible `bankAccountId`. Fixed by adding `include: { bankAccount: true }` to the two read-model
queries that assemble a disbursement for display — `buildTransactionTrace()` (`src/lib/trace.ts`)
and `getMatterFinancialPosition()` (`src/lib/position.ts`) — and rendering the joined bank/account
name in the three surfaces that read from them: `TransactionTraceView.tsx`,
`FinancialPositionView.tsx` (new column on the Disbursement breakdown table), and
`src/app/(app)/disbursements/page.tsx` (list column). A regression test was added and actually
proven to catch this exact class of bug: the `include` was temporarily reverted, the new test was
confirmed to fail, then the fix was restored and the test confirmed to pass again — not just
written and assumed correct.

### Security — HIGH: concurrency race in void/correct (caught pre-ship by mandatory security review)

`assertVoidable`'s status check ran outside and before the `prisma.$transaction` it was meant to
guard, with no re-check inside that transaction — two concurrent void/correct requests against the
same payment (two staff on the same LAN, or one staff double-submitting) could both read
`status: ACTIVE` before either committed, and both proceed, producing two live "corrected"
transactions double-counted in Financial Position. Fixed by making the void **write** itself the
guard instead of a preceding read: `voidFinancialTransactionTx` now issues a conditional
`updateMany({ where: { id, status: "ACTIVE" }, data: { status: "VOIDED", ... } })` and throws
`ALREADY_VOIDED` when it matches zero rows — Postgres's own row lock serializes the two concurrent
UPDATEs, so whichever transaction commits first wins and the other legitimately matches nothing.
Because `/void` and `/correct` both call this same helper, one fix protects both. Proven with a
genuinely interleaved-transaction test (two concurrently-executing Prisma interactive transactions
racing on the same row, not two sequential calls — sequential calls would have passed even before
the fix and wouldn't exercise the race at all) — confirmed to fail without the fix and pass with
it. Two LOW findings from the same review were bundled into this change: whitespace-only
void/correction reasons are now rejected (`!reason.trim()`, both routes), and a non-numeric
`newAmount` on `/correct` is now rejected with a clear `VALIDATION_ERROR` instead of falling
through to a raw database error.

### Process

All four items were implemented in parallel via delegated subagents (architect-agent for the two
open design questions → backend/frontend agent pairs → security-agent → qa-agent → this changelog
step), per the pipeline in `docs/WORKFLOW.md`. `TransactionActions.tsx` was touched by three of the
four items — payment correction, the allocation remaining-balance indicator, and disbursement
bank-account classification — so those three were sequenced on that one file rather than run
concurrently, to avoid two agents racing the same edit.

### Verified

- `npm test`: 116/116 passing, against a live Postgres database like every other scenario test in
  this repo (no mocks). The count last recorded in this changelog was 115/115 (v17); this session's
  parallel work reported intermediate counts as each piece landed (99 → 106 → 111 → 114 → 115 →
  116) — 116 is the current, authoritative figure, independently confirmed by a direct count of
  `it()`/`test()` blocks under `tests/`. `tsc --noEmit`, `npm run lint`, and `npm run build` all
  clean throughout.
- Live-verified against the running Docker container after every backend-affecting change landed
  (rebuilt, redeployed, health-checked via `/api/health`, reachable through the active ngrok
  tunnel) — not just against `npm run dev`.
- Schema: zero changes for items 1–3. One additive migration for item 4
  (`20260812155645_add_bank_account`), verified twice — applied once to a live dev database, and
  independently re-verified via a full from-scratch `prisma migrate deploy` against the test
  database reset.

## [v17] - 2026-08-13

### Added — Document Upload on Client/Matter Position
- `src/components/UploadDocumentModal.tsx` (new) — a trigger-button + modal form for uploading a
  document to a Client or Matter, modeled directly on the existing `AddCostDetailModal.tsx`
  pattern. Exports `UploadDocumentModal({ clientId?, matterId? })` plus a shared `UploadIcon` SVG
  (reused in point below). Submits multipart/form-data (file + one FK) to the *already-existing*
  `POST /api/attachments` endpoint — no backend change was needed. This closes a real half-built
  gap: that endpoint has existed since earlier work with zero UI ever calling it — only download
  links existed (`FinancialPositionView.tsx`, `TransactionTraceView.tsx`), never an upload path.
  No new schema field: `FinancialAttachment` has no notes/description/category column, so the form
  is deliberately just a file picker, nothing more.
- Wired into `src/app/(app)/clients/[id]/page.tsx` (placed between the existing "View Matters"
  link and `CreateMatterForm`'s primary button, which stays rightmost/most prominent — unchanged)
  and `src/app/(app)/matters/[id]/page.tsx` (appended after `AddCostDetailModal` and
  `CreateInvoiceModal`).
- Directly serves pain point #20 (`CLAUDE.md §2`, score 8 — "menelusuri kembali transaksi... dari
  rincian biaya juga") and the ATTACHMENT concept named explicitly in `CLAUDE.md §1`; motivated by
  a prior conversation's analysis that identified the missing upload UI as unshipped scope, not
  new scope.
- Scoped deliberately to Client and Matter only, matching what was actually asked for ("Sources &
  Documents on Client & Matters") — `POST /api/attachments` also technically supports
  transaction/costDetail/invoice FKs, but no UI was built for those here; not addressed by this
  change.

### Changed — Upload entry-point discoverability
- Per explicit user feedback that upload actions were too small/easy to miss for accounting staff:
  `UploadDocumentModal`'s trigger button uses `Button size="md"` (one size class larger than its
  `sm` sibling action buttons on the same page) with the shared upload icon prepended, so it stands
  out rather than blending in.
- The pre-existing "Import Excel" link on `src/app/(app)/transactions/page.tsx` — previously a tiny
  `text-xs` bordered text-only link — restyled to a solid primary button (`bg-primary text-white`,
  `px-4 py-2 text-sm`) with the same upload icon prepended, for visual consistency with the new
  upload button above. Only the link's styling changed; the CSV import wizard itself
  (`/transactions/import`, `ExcelImportWizard.tsx`) is untouched — the ask was about entry-point
  discoverability, not the wizard's internal flow.

### Verified
- `tsc --noEmit`: clean. `npm run lint`: 0 warnings/errors (the pre-existing unrelated `callApi.ts`
  issue noted in v16 was not touched). `npm test`: 115/115 pass. `npm run build`: succeeds.
- Live-verified against the real seeded Postgres DB with a real authenticated session (staff
  `Dewi Anggraini`, PIN `1234`): uploaded a test file to client `Andi Pratama` via the actual
  `POST /api/attachments` call the modal makes — the file appeared in that client's Sources &
  Documents list with a working `/api/attachments/{id}` download link (`200`, correct
  `Content-Disposition`, correct content). Repeated successfully on matter `AJB Tanah Kavling`
  under the same client.
- No security-agent review run — same reasoning as v16: this wires UI onto an already-existing,
  unchanged, already-audited endpoint (`POST /api/attachments` already writes an audit log entry
  on every upload, untouched here) with no new auth/session logic introduced.
- 0 schema change, 0 new dependency, 0 new test (thin UI wiring over an already-tested endpoint and
  an already-established modal pattern, no new business logic or validation rule).

## [v16] - 2026-08-13

### Added — Source Reference Typeahead on New Transaction
- `GET /api/transactions/source-references?search=` (`src/app/api/transactions/source-references/
  route.ts`, new) — returns up to 8 distinct past `FinancialTransaction.sourceReference` values
  matching a case-insensitive substring search. `search` must be at least 2 characters, returning
  `[]` below that — matching the existing `/api/clients?search=` convention exactly, not a new
  contract. Requires an authenticated session via `getCurrentUser`, same as every other GET route.
  Deterministic substring match only, explicitly not AI/fuzzy matching — comment style mirrors
  `src/components/ui/Typeahead.tsx`.
- `NewTransactionModal`'s "Source Reference" field, previously a plain `<input>`, now uses the
  existing `Typeahead` component (`src/components/ui/Typeahead.tsx`, built in v8 for Cost
  Category/Client search) — reused rather than building a new autocomplete, no new UI primitive.
  250ms debounce (matches the existing client-search debounce in the same file) triggers the new
  endpoint once 2+ characters are typed. Free text remains fully valid on submit: selecting a
  suggestion is optional, Tab/Enter commits the highlighted suggestion (existing Typeahead
  keyboard contract), Escape dismisses without altering typed text — no auto-claim, per
  `CLAUDE.md §7` constraint 3.
- Motivation: accounting staff re-typing the same source reference values (bank statement
  filenames, WhatsApp confirmation descriptions, document numbers) when logging several
  transactions from the same source document. Surfaces past values as they type instead of
  requiring memorization/re-typing, without ever forcing a selection.
- Scoped deliberately to `FinancialTransaction.sourceReference` only, not `CostDetail
  .sourceReference` (a separate field on a separate model) — `NewTransactionModal` only ever
  creates `FinancialTransaction` rows, so the query isn't widened to a table this form doesn't
  write to.

### Verified
- `tsc --noEmit`: clean. `npm run lint`: 1 pre-existing unrelated error in `callApi.ts`
  (`@typescript-eslint/no-explicit-any`), not touched or introduced by this change. `npm test`:
  114/114 pass — no new test added, since this is a thin UI/query wiring change over an
  already-tested `Typeahead` component and an already-established list-query pattern, with no new
  business logic, validation rule, or audit-trail-relevant behavior. Live-verified against a
  running dev server with a real authenticated session (seeded demo staff): `GET /api/transactions/
  source-references?search=OVERPAY` against real seed data returned `{"success":true,"data":
  ["BS-2026-OVERPAY-01"],...}`; `?search=a` (1 char, below the 2-char minimum) correctly returned
  `{"success":true,"data":[]}`.
- No security-agent review run for this change — judged not warranted since the new route is a
  plain authenticated GET with no new auth/session logic, directly mirroring the already-reviewed
  `/api/clients?search=` pattern. Noted here explicitly rather than silently skipped.
- 0 schema change (reuses the existing `sourceReference` column, no migration). 0 new dependency
  (reuses the existing `Typeahead` component and `apiFetch` client helper).

## [v15] - 2026-08-13

### Added — Health check endpoint + automated backups
- `GET /api/health` (`src/app/api/health/route.ts`) — an unauthenticated liveness/readiness probe
  (added to `PUBLIC_API_PREFIXES` in `src/middleware.ts` so it bypasses the session-cookie check).
  Runs `prisma.$queryRaw SELECT 1` and returns `200 {status:"ok",timestamp}` or
  `503 {status:"error",timestamp}` on DB failure — the raw error is logged server-side only
  (`console.error`) and never included in the response body, since this route has no auth in front
  of it. Response shape is deliberately not the app's usual `apiSuccess`/`apiError` envelope, since
  it's consumed by Docker, not the frontend.
- `docker-compose.yml`: `app` service gained its own `healthcheck` (`wget -qO-
  http://localhost:3000/api/health`, same pattern already used by the `db` service's `pg_isready`,
  no new package needed — BusyBox `wget` is already present in the Alpine `runner` stage). Motivated
  directly by the v10 incident: a plain "container is running" check would not have caught
  `SESSION_SECRET is not set` making every page 500 while the container still looked up.
- Two new Compose services for backup: `backup` (`prodrigestivill/postgres-backup-local` — a
  maintained image, reused rather than hand-rolling cron+`pg_dump`, per `CLAUDE.md §7.6`) running a
  scheduled `pg_dump` (`SCHEDULE: "@daily"`, retention 14 days / 8 weeks / 6 months), bind-mounted to
  `./backups/db`; and `attachments-backup` (plain `alpine:3` + a `tar`/`find -mtime +14 -delete`
  loop, since the Postgres dump doesn't cover files in the `attachments_data` volume — read-only
  mount of that volume, bind-mounted to `./backups/attachments`). `backups/` added to `.gitignore`.
- `docs/DEPLOYMENT.md` §5 (Backup) and §8 (Health Checks) rewritten to document both of the above,
  including an explicit, honest limitation: `./backups/db` and `./backups/attachments` live on the
  *same physical disk* as the live database/app data, so they do not survive a disk failure by
  themselves — staff must periodically copy `./backups/` to external media. This is deliberate, not
  a gap to close later: no cloud/NAS integration is in scope (`CLAUDE.md §4` non-goals).

### Fixed
- The running `app` container was serving a stale image (same failure class previously logged in
  `CHANGELOG.md` v11 — `docker compose up -d` recreates the container but not the image) — caught
  during live verification of this change and fixed with a rebuild.

### Verified
- `npm run build`/`lint`/`test` all pass, 114/114 tests. Live-verified against the actual running
  Docker Compose stack: all four services (`db`, `app`, `backup`, `attachments-backup`)
  healthy/running, no crash loops; `curl /api/health` confirmed `200` with the documented body.
  Security review: PASS, no blockers. Two non-blocking notes carried forward rather than fixed here:
  (a) `/api/health` is matched by prefix in `PUBLIC_API_PREFIXES`, not exact-match — worth a comment
  if more `/api/health*` routes are ever added; (b) the pre-existing `db` service host port mapping
  (`5432:5432`, not part of this change) is broader attack surface than strictly necessary — flagged
  as a separate future item, not addressed here.
- No schema change, no new required env var (`POSTGRES_PASSWORD` reuses the existing pattern), no
  `Dockerfile` change.

## [v14] - 2026-08-11

### Added — Login + Lock Screen enterprise UX refinement (AUTH_UX_REFINEMENT_REPORT.md, Steps 1-17)
- Login (`src/app/login/page.tsx`) redesigned as a split-screen enterprise layout — dark navy hero
  panel (hidden below `md:`, replaced by a compact inline brand mark on mobile) + soft-neutral form
  panel — with the existing staff-select + PIN mechanism completely untouched, only hardened error
  handling (empty-field short-circuits, no raw parse errors ever reach the screen).
- Lock Screen (`src/components/LockScreen.tsx`) visual/copy pass: fixed a real inaccuracy where the
  timeout modal said "ter-logout" when the actual behavior is a lock, not a logout ("Sesi dikunci
  karena tidak ada aktivitas. Masukkan PIN untuk melanjutkan."); background moved from dark navy to
  the same `bg-bg` soft-neutral token as the login form panel (navy is now exclusively the login
  hero); added the mockup's missing "Masukkan PIN untuk melanjutkan." subtitle; unified shadow
  weight with the login card; wrong-PIN copy changed to "PIN tidak sesuai. Silakan coba lagi." per
  spec (server's own message is unchanged, remapped client-side only); added `pointerdown` to
  tracked activity events; added optional ESC-to-dismiss on the timeout notice (reveals the same
  PIN form the "Mengerti" button leads to — never bypasses the lock).
- **Real accessibility/security gap found and fixed**: `z-[100]` blocked pointer clicks on
  everything underneath but not keyboard Tab order (DOM position, not z-index, governs focus
  order) — Tab could previously cycle focus back into the sidebar/header/page content while
  locked. Fixed with the native `inert` attribute (`AppShellClient.tsx`, wrapping everything except
  `LockOverlay` in a `display:contents` div toggling `inert` on lock) — removes that whole subtree
  from focus, pointer interaction, and the accessibility tree in one line, zero new dependencies,
  typechecks cleanly against React 18.3/TS 5.5. Also added `role="dialog"`/`aria-modal`/
  `aria-labelledby` to both lock states and `role="alert"` to error text (login + lock).
- PIN-error resolution extracted into a new pure function, `src/lib/lockPinError.ts`
  (`resolveVerifyPinError`), so the deterministic "wrong PIN stays locked / correct PIN unlocks"
  logic has real unit coverage without a DOM testing framework — 5 new tests.
- 0 changes anywhere to Prisma schema, migrations, `session.ts`, `middleware.ts`, `/api/auth/*`
  route logic, `exceptionRules.ts`, or any financial/client/matter/invoice/payment/deposit/
  disbursement code — confirmed via file-scope review throughout. 81/81 tests pass (up from 76),
  lint/typecheck/production build all clean. No browser automation tooling exists in this
  environment (no Playwright/Puppeteer/Chromium) — visual/interaction claims (dialog focus, ESC
  handling, `inert` actually blocking Tab, mobile layout) were verified by reading rendered
  HTML/Tailwind output and tracing code, not by driving a real browser; documented honestly as a
  known limitation rather than glossed over. Full report in `AUTH_UX_REFINEMENT_REPORT.md`.

## [v13] - 2026-08-11

### Added — CSV Transaction Import (Workflow Refinement, Steps A-H)
- `/transactions/import`: upload a CSV (e.g. a bank rekap export), auto-map columns via a
  deterministic Indonesian header-alias table (`guessColumnMapping` in `src/lib/excelImport.ts` —
  tanggal/keterangan/masuk/keluar and common variants; unrecognized headers are left unmapped, not
  guessed), preview each row as READY/NEEDS_REVIEW/INVALID with specific reasons, then commit only
  the READY rows via the *existing* `POST /api/transactions` endpoint per row (no new bulk API,
  same pattern as the Bulk Action Toolbar from v9). Imported rows always land `clientId: null,
  matterId: null, sourceType: "EXCEL"` — link/classify/allocate happens afterward through the
  ordinary, untouched transaction workflow, proven end-to-end via a live scenario (link → classify
  as Payment → partial-allocate to an invoice → trace shows the full chain including the
  exception engine's WARNING for the unallocated remainder, computed by unmodified
  `recomputeReviewStatus`).
- **xlsx dropped in favor of a hand-rolled, zero-dependency CSV parser**: adding the `xlsx`
  package surfaced two new unpatched high-severity CVEs (Prototype Pollution, ReDoS — no fix
  available) on top of 5 pre-existing unrelated ones. Decision: CSV-only, `.xlsx` not supported,
  0 new runtime dependencies.
- 21 unit tests for `src/lib/excelImport.ts` (parsing, mapping, date/amount parsing, all 6
  validation scenarios from the spec).

### Added — Date/Client filters on Cost Details, Invoices, Payments
- Each of `/cost-details`, `/invoices`, `/payments` gained a filter form matching the existing
  `/transactions` pattern, scoped rather than full 6-filter parity (assessed as over-engineering
  for pages usually reached by drilling down from Matter/Client Position): date range + a new
  shared `ClientTypeaheadField` component (reuses the existing `/api/clients?search=` endpoint and
  `Typeahead` UI, hidden-input pattern so it works inside a plain native `<form method="get">`
  with zero extra client routing) + one entity-specific filter each — Category (Cost Details),
  Payment Status (Invoices, replacing the old single-purpose "hanya outstanding" toggle link),
  Allocation Status (Payments, replacing the old "hanya belum teralokasi" toggle link). Verified
  live against real seed data (34 → 16 rows on Payments `UNALLOCATED`, Invoices `PAID` correctly
  shows only Paid badges, Cost Details `clientId` correctly narrows to one client).

### Added — Lock Screen: 5-Minute Inactivity Timeout (Steps A-H)
- The pre-existing Lock Screen (`src/components/LockScreen.tsx`) was manual-only — a user-menu
  button toggling a `sessionStorage` overlay flag, with no inactivity detection anywhere in the
  codebase. Added a real 5-minute (300s, `INACTIVITY_TIMEOUT_MS` in `src/lib/inactivityTimer.ts`)
  idle-triggered auto-lock, entirely client-side: a pure `createInactivityTimer({timeoutMs,
  onTimeout})` (parameterized specifically so tests inject small values — no visible production
  setting, no shortened production timeout) armed by `window` activity listeners
  (mousemove/keydown/mousedown/scroll/touchstart), mounted once via `AppShellClient` (which wraps
  the whole authenticated route group in `src/app/(app)/layout.tsx`, so the timer survives
  navigation without resetting, confirmed live across 13 representative pages).
- New STATE C "Sesi Berakhir" modal, shown exactly once per ACTIVE→LOCKED transition caused by the
  timeout (not by a manual lock, and not re-shown on a page refresh while still locked) — backed
  by a one-shot `sessionStorage` pending-notice flag. The lock/reason/pending-notice storage logic
  was extracted into a pure module, `src/lib/lockState.ts` (`readLockState`/`writeLock`/
  `clearLock`/`consumeTimeoutNoticePending`, taking a `Storage` object as a parameter — same
  testability pattern as the timer), with 7 unit tests. Writing those tests caught a real bug
  before shipping: `clearLock()` didn't clear a still-pending notice flag if unlock happened
  before the modal ever consumed it — masked in the wired app (the modal always consumes it at
  mount) but a real latent inconsistency in the module's own contract; fixed defensively.
  6 more unit tests cover the timer itself (fires once after idle, resets on activity, `destroy()`
  stops it, rapid activity collapses to one timer — not a stack).
- Visual refinement to spec: full-screen dark navy (`bg-navy/95` + blur, `#172554`) background,
  centered white (`#ffffff`, confirmed via `globals.css` tokens) card widened from 384px to 420px,
  "Layar terkunci" → "Layar Terkunci" (title case), larger lock/alert icons, `aria-label` on the
  PIN input, `px-4` on the outer container so the card doesn't touch mobile viewport edges.
- Integration hardening found during Step F: `LockOverlay` shared `z-50` with every other modal in
  the app (`NewTransactionModal`, `GlobalSearch`, `AddCostDetailModal`, `CreateInvoiceModal`,
  `LinkDrawer`, `TransactionActions`) and was only reliably on top by DOM paint-order tie-breaking
  — bumped to `z-[100]` so the lock unconditionally wins regardless of what's open when it fires.
  `AppShellClient`'s own two centrally-owned overlays (new-transaction modal, user menu) are now
  also explicitly closed on lock.
- Step H final QA caught one more real mismatch via a live curl against the actual
  `/api/auth/verify-pin` endpoint: the server's wrong-PIN message is the terser "PIN salah."
  (shared wording with the login route), not the spec's fuller "PIN salah. Silakan coba lagi." —
  fixed by having the client override on `errorCode === "INVALID_CREDENTIALS"` specifically, while
  still passing through the real server message for other failures (most notably an actually
  session-expired-while-locked edge case, which gets its own accurate "Sesi berakhir..." message
  rather than a generic one).
- No changes anywhere to `src/lib/session.ts`, `middleware.ts`, PIN hashing/verification, the
  Prisma schema, or any financial/accounting logic — confirmed via `git diff` scope throughout.

### Verified
- 76/76 tests pass (63 pre-existing + 21 excelImport + 6 inactivityTimer + 7 lockState — note some
  overlap with prior totals as suites were added across steps), lint clean, typecheck clean,
  production build clean. Live smoke tests via the dev server + real Postgres throughout (login,
  all 13 authenticated pages, the three new filter forms, and the real `verify-pin` endpoint with
  correct/wrong/missing-session PIN payloads) — no browser automation tooling exists in this
  environment (no Playwright/Puppeteer/Chromium), so actual pixel/click-through verification of
  the Lock Screen's visual design and STATE B→C transition was done by reading the rendered
  Tailwind classes and tracing component mount/state-update order by hand, not by looking at a
  rendered screen — flagged as an honest limitation, not silently glossed over.

## [v12] - 2026-08-11

### Domain Findings (validated directly with the office's accountant, Tami)

- **VALIDATED**: `COST_DETAIL` represents a client-facing charge/rincian biaya (what's billed to
  the client for a matter), not actual office expenditure. The two can genuinely differ (e.g.
  PNBP charged to client Rp500.000 vs. actual disbursement Rp250.000) — `cost_detail.amount` was
  never meant to be read as cash paid out by the office.
- **VALIDATED**: `DEPOSIT` is not the default/generic mechanism for client money — it's used
  specifically when funds are explicitly business-treated as client-held/titipan. Charges that are
  itemized and invoiced (PNBP, BPHTB, etc.) flow through Cost Detail → Invoice → Payment instead.
- **VALIDATED**: Multi-invoice payment allocation (`PAYMENT_ALLOCATION`) is a real, correctly
  supported scenario, but low-frequency in actual office usage.
- **UNKNOWN / DEFERRED**: the business meaning of the gap between client charge and actual
  third-party expenditure has not been validated and must not be treated as profit/margin — no
  such calculation exists anywhere in the codebase, and none was added.

### Added
- Presentation-only terminology pass: every user-facing "Total Cost"/"Cost Detail" label changed
  to "Rincian Biaya" across Dashboard, Clients list, Financial Position (summary tile, card
  header, drill-down caption), Sidebar nav, `/cost-details`, Add Cost Detail modal, Invoice detail,
  Transaction Trace, Search (page + global search), and the Sources aggregation origin labels.
  Zero database/API/component-name/business-logic changes — `cost_detail`, `CostDetail`,
  `/cost-details` (route), and every field name are untouched; only literal JSX display text
  changed. A short tooltip was added to the Rincian Biaya tile: "Total biaya yang dibebankan
  kepada client untuk matter ini — bukan uang yang sudah keluar kantor."
- Lite Mode now reaches the Matter/Client Position screen (previously it only hid Dashboard
  charts). When active: the 8-tile summary collapses to 4 (Rincian Biaya, Invoice, Sudah Dibayar,
  Outstanding — "Sudah Dibayar" reuses the exact same allocated-to-invoices figure the Advanced
  formula caption already computed, not a new calculation), the formula-caption box is hidden, and
  Deposit drops from a primary KPI to a small secondary line ("Uang Titipan... lihat detail →")
  that only renders when the matter actually has deposit history — never an empty card. Advanced
  mode is completely unaffected: every section (Cost Detail, Invoice, Payment, Deposit,
  Disbursement, Sources, Timeline) still renders in full regardless of the toggle.

### Verified unchanged
- `src/lib/position.ts` and `src/lib/exceptionRules.ts` — zero diff (confirmed via `git diff`).
  All 42 existing tests still pass with no changes, proving no financial calculation moved.
  Outstanding value cross-checked identical between Advanced and Lite rendering of the same live
  matter (Rp10.000.000 in both).

## [v11] - 2026-08-11

### Added
- Extended `scripts/seed-demo.ts` with a large, coherent demo dataset (13 clients, 26 matters, 76
  cost details, 25 invoices, 80 financial transactions, 32 payments, 12 deposits, 17
  disbursements, 11 attachments) covering all 20 scenarios from the "Seed Realistic Demo Data"
  brief — named partial-payment scenarios (allowed/disallowed × several amounts), a deliberate
  single overpayment, multi-invoice payment allocation, fully-unallocated payments, unlinked and
  partially-linked transactions, Source Pending, and deposit fully-used/partially-used/untouched
  variety. Every record created through the real route handlers (not raw SQL), so audit trail and
  review-status are computed by the existing, untouched exception engine — not hand-set.
- `DEMO_SCENARIOS.md` — 8-stop manual walkthrough guide referencing real seeded records.
- The seed script is now properly idempotent end-to-end (previously only the Staff block was):
  re-running it detects already-seeded data and fetches instead of re-creating, and a separate
  small "payment top-up" section (added to land the Payment count in the requested 30-40 range)
  has its own independent idempotency check. Verified by running the script three times in a row —
  the second and third runs produced identical DB counts (zero new records).

### Fixed
- The pre-existing seed script had **no idempotency guard at all** — running it twice would have
  duplicated every client/matter and collided on hardcoded invoice numbers (`INV-2026-001` etc.).
  This surfaced immediately as a real `P2002` unique-constraint error during this task's first run
  attempt (the dev DB already had the original 2-client dataset from earlier deployment testing).
  Fixed by making the invoice-number counter derive from actual DB state instead of a hardcoded
  starting value, and by fetching rather than re-creating when the original block's marker client
  already exists.
- **Docker image was 6+ hours stale**: discovered while smoke-testing the newly seeded data — the
  container had been serving pre-P0/P1/P2/pre-refinement code the whole time (an earlier
  `docker compose up -d` to apply the SESSION_SECRET fix recreated the *container* but reused the
  *old image*, since compose doesn't rebuild automatically). Every UX-refinement feature (Needs
  Attention, drill-down formulas, bulk actions, Typeahead, etc.) was invisible via the deployed
  ngrok URL until this was caught. Rebuilt and redeployed with `docker compose build app && docker
  compose up -d app`.

### Known artifact (not fixed, by design)
- A single duplicate, empty "PT Nusantara Properti" client + matter exists in the dev database —
  created by the P2002 collision above before the idempotency fix landed. It has 4 cost detail
  rows and no invoice/transaction. Attempted cleanup via direct `DELETE`, but `cost_detail`'s
  `prevent_delete()` trigger blocked it (by design — the same immutability guarantee the whole app
  relies on applies here too, without exception). Left in place rather than working around the
  trigger.

### Database / API / Business logic
- UNCHANGED. `git diff` for this task touches only `scripts/seed-demo.ts` and adds
  `DEMO_SCENARIOS.md` — zero changes to `prisma/schema.prisma`, `src/lib/exceptionRules.ts`,
  `src/lib/position.ts`, any API route, or any UI component.

## [v10] - 2026-08-11

### Fixed
- **Production error on every page**: "Application error: a server-side exception has occurred"
  (digest `3884641326`). Root cause: `docker-compose.yml`'s `app` service `environment:` block
  only ever declared `DATABASE_URL` and `ATTACHMENTS_DIR` — `SESSION_SECRET` was never wired
  through to the container at all. Every page calls `requireSession()` →
  `verifySessionCookieValue()` → `sign()` → `secret()` (`src/lib/session.ts`), which throws
  exactly `"SESSION_SECRET is not set."` when the env var is absent — confirmed via
  `docker inspect .Config.Env` (never present since container creation) and matching container
  logs (exact digest match). **Not caused by the P0/P1/P2 or workflow-refinement work** —
  `session.ts` and `docker-compose.yml` were untouched by both of those phases; this was a
  pre-existing deployment-config gap.
  - Fix: added `SESSION_SECRET: ${SESSION_SECRET:?SESSION_SECRET must be set in .env}` to
    `docker-compose.yml`'s `app.environment` — Compose's required-variable syntax, so a missing
    secret now fails loudly at `docker compose up` instead of silently at first page load with a
    cryptic digest.
  - Regression test: `tests/unit/session.test.ts` — locks in the fail-fast throw when
    `SESSION_SECRET` is missing (the exact mechanism that made this bug diagnosable at all) and
    the correct sign/verify round-trip once it's present. The infra half of the regression guard
    is the compose file's `${VAR:?message}` syntax itself.
  - Zero application code changed. Zero schema change. Zero business rule change.

## [v9] - 2026-08-11

### Added
- Financial Control Workflow Refinement, Phase 2 (post P0/P1/P2) — full detail in
  `FINANCIAL_CONTROL_WORKFLOW_REFINEMENT_REPORT.md`. Summary:
  - **Financial position drill-down**: TOTAL footer rows on every breakdown table (Cost Detail,
    Invoice, Payment, Deposit, Disbursement) and explicit formula captions ("Outstanding = Total
    Invoice − Allocated = ...") on `FinancialPositionView` — all arithmetic over numbers
    `position.ts` already computes, no new calculation logic.
  - **Unlinked/partial-link clarity**: `LinkDrawer` now shows Client and Matter as two distinct
    labeled states instead of one combined message, plus an explicit "Selesaikan nanti" (Complete
    Later) action.
  - **Partial payment explanation**: Invoice and Payment detail pages now explain in plain language
    why a partial payment is Normal vs. will be flagged Review Required, sourced from the existing
    `allowPartialPayment` flag.
  - **Needs Attention**: added the 5th category (Unallocated Payments) in the specified priority
    order; added `allocationStatus=UNALLOCATED` filtering to the Payments page so it's clickable.
  - **Bulk workflow** (new): select multiple transactions on the Transactions page, bulk-assign
    Client/Matter or bulk-classify — implemented as client-side loops over the existing
    single-transaction `/link` and `/classify` endpoints, deliberately no new bulk API route.
  - **Search page restyle**: `/search` was the one screen still using raw inline styles; rebuilt on
    the shared Tailwind design system components. Search logic itself (grouping, amount/date
    matching) was already comprehensive and unchanged.
  - **Exception explanation**: new deterministic (non-AI) `suggestedActionForReason()` maps the
    existing audit-log reason strings to a plain "what can I do" suggestion, shown in the Review
    Center and Transaction Trace timeline.

### Rejected (by explicit user decision, not a bug)
- Phase 3.4 asked for payment allocation to become *blocking* when
  `SUM(allocation) > payment amount`. This directly conflicted with the existing, deliberately
  validated non-blocking design (`/api/payments/[id]/allocate`'s own code comment: "never an
  automatic financial decision, never blocking," per Step 9). Flagged to the user per the
  refinement prompt's own STOP CONDITION rather than implemented silently — user chose to keep the
  existing behavior. No code changed for this item.

### Tests
- 40/40 passing, up from 32. 6 new unit tests for the suggested-action matcher, 2 new scenario
  tests (unallocated-payment count delta against a real partial allocation; partial-link state
  persistence) against a real Postgres database. Live regression smoke test against a running dev
  server covered all 17 pages from the prompt's checklist plus real record IDs — all 200, new
  features confirmed rendering with mathematically correct values against real seeded data.

### Database / API
- No schema change, no migration, no new dependency, no new API route. One new query parameter
  (`allocationStatus` on the Payments page).

## [v8] - 2026-08-11

### Added
- P0/P1/P2 UX & traceability improvement pass (see `FINANCIAL_CONTROL_IMPROVEMENT_REPORT.md` for
  full detail). Summary:
  - **P0**: fixed a real sidebar collapse/expand bug (collapsed-header layout overflow made the
    expand toggle effectively unclickable); new deterministic `Typeahead` component (Tab-commit,
    Esc-dismiss, arrow-nav, free text always allowed) applied to Cost Detail Category and Client
    search, the one field that was genuinely mouse-only before.
  - **P1**: confirmed Client→Matter cascading was already correct and made the invalidation
    explicit; added a "Needs Attention" Dashboard section (Review Required, Unlinked, Source
    Pending, Outstanding — each clickable to a real filtered view); enriched Transaction Trace
    with previously-dropped `deposit` data, per-invoice Outstanding on allocations, and `notes`.
  - **P2**: added the missing `GET /api/attachments/[id]` download route (none existed anywhere in
    the app before this) and made all attachment listings consistently clickable; closed the
    long-standing `SYSTEM_CONSISTENCY_REPORT.md` check #1 WARNING with a real Matter-level source
    aggregation (`getMatterSourceSummary`) and a lighter Client-level one
    (`getClientSourceSummary`, count + capped recent list).

### Fixed
- Dashboard "Unlinked Transactions" card linked to `/review`, which the Review Center's own code
  explicitly excludes unlinked-but-normal transactions from — now links to
  `/transactions?linked=unlinked`.
- `buildTransactionTrace` fetched `deposit` from the database but never included it in the returned
  data — silently dropped before reaching the UI.

### Tests
- 32/32 passing, up from 23 at the start of this pass (7 new unit tests for the deterministic
  category matcher, 2 new scenario tests for source aggregation, 1 existing scenario extended with
  real download/401/404 assertions). No component/DOM interaction test infrastructure exists in
  this repo (only route-handler tests against a real database) — adding one was judged out of
  scope per the brief's explicit dependency caution; documented as a known limitation rather than
  silently skipped.

### Database / API
- No schema change, no migration, no new dependency. One new route
  (`GET /api/attachments/[id]`) and two extended query params (`sourceType` on the Transactions
  page, `outstanding` on the Invoices page) — no breaking changes to any existing contract.

## [v7] - 2026-08-11

### Added
- "Lite Mode" — a header toggle that hides the Dashboard's two charts (Financial Activity Over
  Time, Review Distribution) for a less visually dense view. Presentation-only: a browser cookie
  (`ui_lite_mode`), not a Staff/system_setting DB field — zero schema impact. Server Components
  read the cookie directly so the chart data isn't even fetched when the toggle is on, not just
  hidden client-side after the fact.
- Files: `src/lib/liteMode.ts`, `src/components/LiteModeToggle.tsx`,
  `src/app/(app)/layout.tsx`, `src/components/AppShellClient.tsx`, `src/app/(app)/page.tsx`.

## [v6] - 2026-08-11

### Added
- Full documentation framework under `docs/`: `PRD.md` (project-wide product requirements),
  `PROJECT_RULES.md` (binding hard constraints + process/escalation rules), `SYSTEM_OVERVIEW.md`
  (technical architecture), `WORKFLOW.md` (change pipeline with diagram), `AGENT_COMMUNICATION.md`
  (handoff protocol between specialist agents), `PROJECT_MEMORY.md` (what's remembered where),
  `REPOSITORY_STRUCTURE.md`, `CODING_STANDARD.md`, `TESTING_STANDARD.md`, `DEPLOYMENT.md`,
  `ROADMAP.md`.
- 10 operational Claude Code subagents in `.claude/agents/`: `orchestrator`, `planner-agent`,
  `architect-agent`, `frontend-agent`, `backend-agent`, `qa-agent`, `debug-agent`,
  `security-agent`, `devops-agent`, `reporter-agent` — each with real frontmatter (tool access,
  model) and instructions grounded in this repo's actual patterns (e.g. the `withApiHandler` /
  `writeAuditLog` route shape, the real-database testing rule, the Alpine/OpenSSL deployment gotcha).
- README.md and CLAUDE.md updated to point into the new `docs/` framework.

### Context
- Triggered by a live walkthrough with the office's accounting staff (2026-08-11), who asked six
  clarifying questions about the app's financial model (Total Cost vs. Total Invoice, Deposit
  Received vs. honorarium income, Total Payment vs. Deposit Received, invoice numbering, payment
  editing, and per-bank disbursement categorization). Three of those became concrete backlog items
  in `docs/ROADMAP.md` (not implemented yet — recorded with open questions to clarify before
  building, per the new escalation rules this same change introduces).

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
