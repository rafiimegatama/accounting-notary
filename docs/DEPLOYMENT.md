# Deployment

The only supported deployment model is **Docker Compose on one office server, accessed over
LAN**. There is no cloud/managed deployment path, and none should be added without a deliberate
decision recorded in `CHANGELOG.md` (see `PROJECT_RULES.md §4` — this is an escalation trigger,
not a routine choice).

## 1. Standard Runbook

```bash
# 1. Secrets — never commit the real .env
cp .env.example .env
# edit .env: set a real POSTGRES_PASSWORD and SESSION_SECRET (long random values)

# 2. Build + start (tags the image with the current git commit — see §13d)
sh scripts/deploy.sh

# 3. Apply migrations (fresh DB or after a schema change — takes an
#    immediate pre-migration snapshot first, see §13e)
sh scripts/migrate.sh

# 4. (optional, non-production) seed demo data
docker compose exec app npm run seed:demo
```

Step 2 replaces the older `docker compose build --no-cache && docker compose up -d` — that still
works directly if needed (e.g. a first-time `--no-cache` rebuild after a base-image bump: run it once,
then switch back to `scripts/deploy.sh` for the next deploy), but going through `scripts/deploy.sh`/
`scripts/migrate.sh` is what makes rollback (§13d) and the pre-migration safety net (§13e) actually
available later.

App is served at `http://<server-ip>:3000`. Verify with:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login   # expect 200
```

## 2. Known Issue: Alpine + Prisma needs OpenSSL

`node:20-alpine` (used in both the `builder` and `runner` Dockerfile stages) does not ship
OpenSSL, which Prisma's schema/migration engine binaries require at runtime. Without it,
`prisma migrate deploy` fails with an unparsable engine response
(`Could not parse schema engine response: SyntaxError...`) — this looks like a Prisma bug but is
actually a missing system dependency. **Already fixed** (`CHANGELOG.md` v5) by adding
`RUN apk add --no-cache openssl` to both stages. If this error reappears after a base-image bump,
check that line is still present before debugging further.

## 3. Seeding

`scripts/seed-demo.ts` seeds through the real route handlers (not raw SQL), so audit trail and
review-status computation populate exactly as real usage would. It needs the full app source
(not present in the slim `runner` image) — run it via the `builder` stage:

```bash
docker build --target=builder -t <project>-seed .
docker run --rm --network <project>_default \
  -e DATABASE_URL="postgresql://notary_app:<password>@db:5432/notary_financial_control?schema=public" \
  -e SESSION_SECRET="<same as .env>" \
  --entrypoint sh <project>-seed -c '
    echo "DATABASE_URL=$DATABASE_URL" > .env
    echo "SESSION_SECRET=$SESSION_SECRET" >> .env
    npm run seed:demo
  '
```

(`.env` is gitignored and dockerignored on purpose — it's written at container runtime here, not
baked into any image.) Demo login PIN: `1234` for all seeded staff. **Never run this against a
database with real client data** — it's additive but not meant for production use.

## 4. Environment Variables

| Var | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | Never commit a real value; `.env.example` has the placeholder shape |
| `SESSION_SECRET` | HMAC key for session cookie signing | Generate a long random value per deployment; rotating it invalidates all sessions |
| `POSTGRES_PASSWORD` | Compose-level DB password | Override the `changeme_dev_only` default before any real use |
| `ATTACHMENTS_DIR` | Filesystem path for uploaded files | Set in `docker-compose.yml`, backed by a named volume |
| `COOKIE_SECURE` | Adds the `Secure` flag to the session cookie | Defaults `false`; see §10 — only set `true` after confirming the `caddy` TLS path actually works |
| `BACKUP_DB_DIR` / `BACKUP_ATTACHMENTS_DIR` | Read-only paths Settings > Backup & Recovery reads for status display | Set in `docker-compose.yml`, bind-mounted `:ro` from the same `./backups/` the `backup`/`attachments-backup` services write — the app never writes here (`src/lib/backupStatus.ts`) |

## 5. Backup

Automated as of `CHANGELOG.md` (see entry for this change) via two extra Compose services — both
started automatically by `docker compose up -d`, no separate cron or host setup needed:

**Postgres data (`backup` service, `prodrigestivill/postgres-backup-local` image)**
- Schedule: `@daily`.
- Retention: 14 daily, 8 weekly, 6 monthly (gzip-compressed, auto-rotated by the image).
- Lands on the host at `./backups/db/{daily,weekly,monthly,last}/` (bind mount, not a named
  volume — deliberately, so files are directly visible/copyable from the host filesystem).

**Attachments (`attachments-backup` service, plain `alpine:3` + a `tar`/`find` loop)**
- The Postgres backup above does not cover `ATTACHMENTS_DIR` (uploaded proof-of-payment/supporting
  docs, stored in the `attachments_data` named volume) — this second service tars that volume daily
  and prunes anything older than 14 days.
- Lands on the host at `./backups/attachments/attachments-<timestamp>.tar.gz`.

**In-app status** — Settings > Backup & Recovery (`src/components/BackupRecoverySettings.tsx`) shows
staff a read-only summary of the above (last backup timestamp, freshness, lightweight history) by
reading these same directories through a `:ro` bind mount (`src/lib/backupStatus.ts`,
`BACKUP_DB_DIR`/`BACKUP_ATTACHMENTS_DIR` in §4). It cannot trigger a backup or a restore — see the
component's own header comment for why — those remain the administrator actions documented in this
section.

**Manual one-off backup** (unchanged, still useful for an ad hoc dump outside the schedule):
```bash
docker compose exec db pg_dump -U notary_app notary_financial_control > backup-$(date +%F).sql
```

**Restore drill — `scripts/restore-drill.sh`.** An infra audit flagged "backup exists but restore was
never verified" — an untested backup is not a real backup. This script restores the most recent
dump into a disposable scratch database (`notary_financial_control_restore_drill`) and drops it
afterward; the live database is never touched, safe to re-run:
```bash
sh scripts/restore-drill.sh                              # most recent daily dump
sh scripts/restore-drill.sh ./backups/db/last/notary_financial_control-latest.sql.gz
```
Run this periodically (recommended: alongside the weekly off-machine copy check above) — it's the
only way to actually catch a corrupt/non-restorable dump before the day it's needed for real.

**Found and fixed while first running this drill**: the `backup` service's image
(`prodrigestivill/postgres-backup-local`, previously unpinned `:latest`) bundled `pg_dump` 18, while
`db` runs `postgres:16-alpine` (server 16.x). `pg_dump` 18 emits `SET transaction_timeout = 0` — a
Postgres 17+-only session parameter — into every dump it produces. Restoring that dump against this
stack's actual Postgres 16 server failed immediately with `ERROR: unrecognized configuration
parameter "transaction_timeout"`. The daily backup had been running successfully (no error in its
own logs — `pg_dump` doesn't know or care what server version will eventually restore it) but was
silently NOT restorable. Fixed by pinning `docker-compose.yml`'s `backup` image to the
`16-alpine` tag (bundles `pg_dump` 16.10, matching the server) — confirmed live: a dump produced by
the pinned image restores cleanly via `scripts/restore-drill.sh` (real row counts verified against
the actual seeded data: 3 staff / 16 client / 26 matter / 86 financial_transaction / 367 audit_log).
If the `db` service's Postgres major version is ever upgraded, re-pin `backup` to match, or this
same failure mode will silently return.

**Off-machine copy.** Both `./backups/db/` and `./backups/attachments/` live on the *same physical
disk* as the live database and app data (bind mounts, same office server). This protects against
accidental deletion or a bad migration/query, but **not against disk failure** — if the server's
disk dies, both the live data and these backups are lost together.

If the office has a second internal disk in the same server, this is now automated —
`scripts/offsite-sync.sh`, see §14. That covers *disk* failure. It does **not** cover the server
disappearing entirely (fire, theft, flood) — for that, the manual step below (copying to media that
leaves the building) is still the only line of defense, and is still not automated on purpose: this
system deliberately has no cloud/NAS integration (`CLAUDE.md §4` non-goals), and pushing backups off
the office LAN without a deliberate decision recorded per `PROJECT_RULES.md §4` would cross that
line. What *can* be tightened without crossing it is making the manual step concrete instead of
open-ended:

- **Recommended cadence: weekly**, matching the `backup` service's daily-dump / 14-day-retention
  window (`docker-compose.yml`) — a weekly off-machine copy means a disk failure can lose at most
  ~1 week of data, not everything back to the last time someone remembered to do it.
- **Copy the whole `./backups/` directory** (both `db/` and `attachments/` subfolders — a backup
  missing one or the other is incomplete) to a USB drive or network share.
- **Verify the copy, don't just trust the copy dialog** — open the most recent `.sql.gz` (`db/
  daily/`) and the most recent `attachments-*.tar.gz` on the external media and confirm they're
  non-empty and dated as expected. An untested backup is not a backup.
- Whoever does this should be a named responsibility (e.g. "office manager, every Monday"), not an
  implicit "someone will get to it" — the failure mode for an unowned manual task is that it quietly
  stops happening.

Given the immutable/audit-logged data model, a backup is primarily disaster recovery, not a
correction mechanism — the app itself never needs "restore to fix a mistake" because mistakes are
voided, not deleted.

## 6. Rollback

- App code: `sh scripts/rollback.sh <git-sha-tag>` — see §13d. Falls back to redeploying the previous
  commit (`git checkout <commit> && sh scripts/deploy.sh`) if that tag was already pruned.
- Schema: Prisma migrations are forward-only in this project — there is no down-migration tooling
  wired up. Rolling back a schema change means writing and applying a new forward migration that
  reverses it, following the same additive/non-destructive rule as any other migration
  (`PROJECT_RULES.md §3`). A destructive rollback (dropping a column that has data) needs explicit
  human sign-off, same as any destructive migration.

## 7. Temporary Remote Access (ngrok) — not a deployment model

An ngrok tunnel was used once for a demo/testing session (`CHANGELOG.md` v5). This is **not** part
of the supported deployment model and should never be left running unattended:
- Free-tier URLs are ephemeral and unauthenticated beyond the app's own staff-PIN login — treat
  any such tunnel as public internet exposure of live financial data for as long as it's up.
- Tear it down when the session ends. If recurring remote access becomes a real requirement, that's
  an escalation per `PROJECT_RULES.md §4`, not something to routinely re-open.

## 8. Health Checks

`docker-compose.yml` defines a Postgres healthcheck (`pg_isready`) that the `app` service depends
on (`condition: service_healthy`) — the app container won't start until the DB is actually ready to
accept connections.

The `app` service also has its own healthcheck now, polling `GET /api/health` (unauthenticated,
bypasses session middleware on purpose) with `wget` every 10s:
```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 15s
```
This exists because a plain "container is running" check missed the v10 SESSION_SECRET incident —
the container looked up while every page was actually 500ing. `/api/health` does a real
`SELECT 1` against the DB and returns 503 if it fails, so `docker compose ps` / `docker inspect`
now reflect real app+DB readiness, not just process liveness. `GET /login` returning 200 remains a
valid manual check too, but `docker compose ps` health status is now the primary automated signal.

## 9. Network Exposure & Restart Policy

Both hardening gaps below were found during an architecture review of the LAN/WiFi deployment
model and fixed directly in `docker-compose.yml` (no schema/app-code change):

- **Postgres is no longer published to the LAN.** `db`'s port mapping is `127.0.0.1:5432:5432`,
  not `5432:5432` — the app container already reaches Postgres over the internal Compose network
  (`db:5432`), so the previous unbound publish only ever served occasional host-side debugging
  (`psql`/a local DB GUI on the server itself) while leaving the database directly reachable from
  *any* device on the office LAN/WiFi, not just the app. If host-side DB access is never actually
  used, remove the `ports:` block under `db` entirely instead of binding it to localhost.
- **`app` and `db` now both have `restart: unless-stopped`**, matching the policy the `backup`/
  `attachments-backup` services already had. Previously a host reboot or power blip left the app
  and database down until someone manually ran `docker compose up -d` — on a WiFi-only office this
  is a more common trigger than on a wired setup with stable power, and there's rarely dedicated
  IT staff on-site to notice and restart it by hand.
- **Connect the server itself with an Ethernet cable, even in an otherwise WiFi-only office.**
  This is operational guidance, not something enforceable in code. If the machine running
  `docker compose up -d` is on WiFi, every staff member's session depends on that one radio link
  simultaneously — a dropped/weak signal on the server stalls the whole office at once. If instead
  only the *staff client PCs* are on WiFi (the server is wired), a bad WiFi moment degrades one
  person's connection, not everyone's. Most office mini-PCs/desktops have a built-in Ethernet port
  for exactly this reason; prefer it over a WiFi dongle for the server specifically.

## 10. TLS for LAN Access (Caddy)

Found during a security review: the app was plain HTTP only (`app`'s `3000:3000` mapping), and the
session cookie had no `Secure` flag (`src/app/api/auth/login/route.ts`,
`src/app/api/auth/logout/route.ts`). On a wired LAN that needs a tap/compromised switch to sniff;
on WiFi it only needs radio range and a weak/shared PSK — the staff PIN (login POST body) and the
session cookie travel in cleartext, and a captured cookie can be replayed for up to 12h
(`SESSION_TTL_MS`, `src/lib/session.ts`) to impersonate that staff member, including in the audit
trail. Fixed with a `caddy` service (`docker-compose.yml`) terminating TLS in front of the app.

**This is additive, not a replacement.** `app`'s existing `3000:3000` mapping is untouched — that's
what the temporary ngrok tunnel (§7) points at today, and it keeps working exactly as before,
unaffected by any of this. `caddy` listens on a new port (`443`) and reverse-proxies to the app
over the internal Compose network (`app:3000`).

`tls internal` (`Caddyfile`) makes Caddy generate its own local Certificate Authority instead of
requesting a public cert — appropriate here since staff reach the server by LAN IP, not a public
domain, and there's no internet-facing surface to run Let's Encrypt/ACME against in the first place.
The CA (and issued leaf certs) live in the `caddy_data` named volume, so they survive
`docker compose restart`/`up -d` — do **not** delete that volume casually, or every staff browser
will need to re-trust the new CA it regenerates.

### One-time setup per office

1. `docker compose up -d` (brings up `caddy` alongside the existing services — nothing else to
   change first).
2. Export Caddy's local root CA cert so staff browsers can trust it (self-signed, so without this
   every visit shows a browser warning):
   ```bash
   docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > office-root-ca.crt
   ```
   Distribute `office-root-ca.crt` to each staff machine and import it into the OS trust store
   (Windows: `certmgr.msc` → *Trusted Root Certification Authorities* → *Import*). This is a manual,
   one-time step per machine — no MDM/PKI automation exists in this project, consistent with
   `CLAUDE.md §4`'s non-goals around complex IT tooling.
3. Verify from a staff machine: `https://<server-ip>` loads without a certificate warning and login
   works.
4. **Only after step 3 is confirmed working**, set `COOKIE_SECURE=true` in `.env` and
   `docker compose up -d` again (recreates `app` with the new env var). Before this step,
   `COOKIE_SECURE` defaults to `false` and the cookie behaves exactly as before — flipping it early,
   before TLS is verified reachable, silently drops the session cookie on any plain-HTTP request and
   locks staff out of login until it's reverted.

Staff continue reaching the app at `https://<server-ip>` instead of `http://<server-ip>:3000`
(port 443 is the browser default for `https://`, so no port suffix needed going forward).

## 11. Login Lockout

An infra audit flagged login PIN attempts as unlimited — brute-forceable given enough time,
especially over LAN/WiFi. Fixed in `src/lib/loginRateLimit.ts`: after 5 failed PIN attempts for a
given staff member, that staffId is locked for 5 minutes (`LOGIN_MAX_ATTEMPTS`/`LOGIN_LOCKOUT_MS`),
returning `429` with a clear Indonesian message including the remaining wait. A successful login
clears the counter.

Keyed by **staffId**, not source IP — the PIN is the credential actually being brute-forced, and
this stays robust whether the request comes through ngrok, Caddy, or the plain LAN port, and
doesn't accidentally lock out multiple legitimate staff who happen to share one office egress IP.

Deliberately **in-memory**, no new dependency, no schema/migration — resets on app restart (deploy
time only, not attacker-controlled), an acceptable tradeoff for this single-process deployment. Live
smoke-tested against a real staff account: 5 wrong-PIN POSTs returned `401`, the 6th returned `429`
with the lockout message.

## 12. Resource Limits & Logging

An infra audit flagged two gaps common to long-running `restart: unless-stopped` stacks on a single
shared office box: no per-service memory/CPU ceiling (one runaway process can starve the other four
services) and no log rotation (Docker's default `json-file` driver has no size cap, so logs grow
unbounded over months of uptime).

Both fixed in `docker-compose.yml`: a shared `x-logging` YAML anchor (10MB × 3 files per service,
~30MB cap) applied to all five services, and a `deploy.resources.limits` block per service (`db`
1GB/2cpu, `app` 1.5GB/2cpu, `caddy` 256MB/0.5cpu, `backup`/`attachments-backup` 512MB/1cpu each).
These are starting points, not measured against this office's actual server specs — watch real
`docker stats` under normal daily use and adjust if a service is ever throttled.

## 13a. Image Reproducibility (Digest Pinning)

All 5 images (`node:20-alpine` in the Dockerfile's 4 stages, `postgres:16-alpine`, `caddy:2-alpine`,
`prodrigestivill/postgres-backup-local:16-alpine`, `alpine:3`) are pinned by digest
(`image:tag@sha256:...`), not just tag. A floating tag can silently resolve to a different build
between two `--no-cache` rebuilds months apart — the tag alone doesn't guarantee the same bytes.

**To refresh a pin deliberately** (e.g. picking up an Alpine security patch), don't hand-edit the
hash:
```bash
docker pull <image>:<tag>
docker inspect <image>:<tag> --format='{{index .RepoDigests 0}}'
```
Update `docker-compose.yml` and (for `node:20-alpine`) all 4 stages in `Dockerfile` together, then
re-verify with `docker compose config` and a full `docker build .` before deploying. An unpinned
patch bump is exactly the untested drift this pinning exists to prevent.

## 13b. attachments-backup Health Signal

Found in a DevOps architecture review: the `attachments-backup` service (§5) was a bare `while true`
shell loop with no failure signal at all — a `tar` that failed every single night (disk full, `/data`
unreadable) would still leave the container `running` forever, indistinguishable from a working
backup in `docker compose ps` or `scripts/check-health.sh`. The same "ran" vs "actually worked" gap
the v31 pg_dump-version bug already turned out to be (`§5` restore drill), just for a different
service, undetected because nothing checked it.

Fixed: each loop iteration now writes `/backups/.attachments-backup-status` (`OK <timestamp>` or
`FAILED <timestamp>`), and a real Docker `healthcheck` on the service requires both a recent status
file (< 26h old — the loop runs once every 24h, so this only trips on a late/stuck run, not
mid-cycle) and its content being `OK`. `scripts/check-health.sh` needed no changes — it already
reports any service's real Docker health status generically, and this service simply went from
`no-healthcheck` to a real one. Verified directly against busybox (Alpine's actual shell/`find`, not
GNU coreutils) for all three states: fresh+OK → healthy, fresh+FAILED → unhealthy, stale-even-if-OK →
unhealthy.

## 13c. CI (`.github/workflows/ci.yml`)

Code-quality gate only — does **not** touch the deployment model, which stays manual/on-prem Docker
Compose on the office server (§1). Runs on every push to `main` and every PR: `lint` → `tsc --noEmit`
→ full `vitest run` (unit + `tests/scenarios`, against a real `postgres:16-alpine` GitHub Actions
service container, matching `db`'s actual version) → `next build`, plus a separate `docker build .`
job proving the Dockerfile itself still builds cleanly end to end — the layer that actually broke
production twice before (v5's missing OpenSSL, v31's `npm install`/`npm ci` lockfile drift), which
neither `next build` nor `tsc` alone would catch.

Does **not** reuse `scripts/reset-test-db.sh` as-is — that script's `docker compose exec -T db ...`
assumes an existing docker-compose stack, which a GitHub Actions service container isn't (and doesn't
need to be: it's already a fresh, empty database every run, so the drop/recreate dance a reused local
Postgres needs isn't necessary). CI writes its own disposable `.env.test` pointed at the service
container instead.

## 13d. Deploy / Rollback (`scripts/deploy.sh` / `scripts/rollback.sh`)

Found in a DevOps architecture review: `docker compose build` overwrites the local `app` image in
place — there was no previous build retained to fall back to, so §6's "redeploy the previous
image/commit" meant *rebuilding* that commit and hoping the build environment (base images, `npm`
registry) hadn't shifted since. Fixed by tagging every deploy with the git commit SHA instead of only
`:latest`:

- `docker-compose.yml`'s `app` service now has an explicit `image: notary-accounting-app:${APP_IMAGE_TAG:-latest}`
  (previously unset — Compose derived an implicit name from the checkout directory, not guaranteed
  stable across clones).
- `sh scripts/deploy.sh` — refuses to run on a dirty working tree (a SHA-tagged image must
  correspond to an actual commit, or rollback-by-SHA is meaningless; override with `--allow-dirty`
  if truly needed), builds and tags `notary-accounting-app:<git-sha>`, also retags it `:latest`,
  starts the stack, then prunes old builds beyond the last 3 (by build time, not tag string — git
  SHAs don't sort chronologically).
- `sh scripts/rollback.sh <git-sha-tag>` — switches the running `app` container to an
  already-built image via `docker compose up -d app`, no rebuild. Only works for a tag the last
  deploy's pruning hasn't removed yet; anything older needs `git checkout <commit>` followed by
  `scripts/deploy.sh` again. Explicitly does **not** roll back the database — if the rollback target
  predates a migration that already ran against live data, that's a schema mismatch this script
  can't fix (§6).

Verified this session: the prune-by-creation-time logic was tested against 5 dummy tagged images
(distinct build times, a `latest` pointer) — correctly kept the 3 newest + `latest`, removed the 2
oldest. Not verified against a real `docker compose up -d` cycle of this project's own `app`
service — this session couldn't confirm whether the checkout's existing Docker state (an already-
provisioned `db_data`/`attachments_data` volume was present) belonged to an active deployment, and
erred on the side of not disrupting it. Run `sh scripts/deploy.sh` once by hand and confirm
`/api/health` before relying on it for a real rollback.

## 13e. Pre-Migration Snapshot (`scripts/migrate.sh`)

Found in the same review: `prisma migrate deploy` ran directly against production data with only the
*daily* `backup` service dump as a safety margin (§5) — a bad migration at 2pm could lose up to a
day of changes if a restore was needed. `sh scripts/migrate.sh` closes this cheaply: takes an
immediate `pg_dump` (piped through `gzip`, written to `./backups/pre-migration/`, kept separate from
and with a shorter retention than the `backup` service's own 14d/8w/6mo dumps — this is a safety net
around one deploy action, not a long-term archive) *immediately* before running `migrate deploy`,
refuses to proceed if the snapshot came back empty, and keeps the last 10 pre-migration snapshots.

Verified this session: both the exact SQL/pipe (`pg_dump ... | gzip`) and `prisma migrate deploy`
were run against a disposable Postgres container seeded with this project's real migrations —
produced a valid, non-empty dump (15 `CREATE TABLE` statements, matching the schema) and applied all
6 migrations cleanly.

## 13f. Capacity / Growth Tracking (`scripts/capacity-report.sh`)

Found in the same review: `audit_log`/`financial_transaction`/`payment_allocation` are append-only by
design (immutable audit trail, `CLAUDE.md §7` constraints 5/8) — correct, but nothing tracked how
fast they (or `db_data` generally) were growing. `scripts/check-health.sh`'s 85%-disk-used check is
reactive, not predictive. `sh scripts/capacity-report.sh` snapshots row count + `pg_total_relation_size`
for all 14 tables (from `prisma/schema.prisma`'s `@@map` names, not a hand-picked subset) plus total
database size, appends to `./backups/capacity-log.csv` (kept indefinitely — a small text file, not a
backup), and prints a readable summary. Recommended: run weekly via the same cron mechanism as
`scripts/offsite-sync.sh`/`scripts/check-health.sh`. Open the CSV in a spreadsheet to see growth rate
and project disk needs ahead of the reactive 85% threshold — deliberately not a monitoring stack
(Grafana/Prometheus, Elastic/Kibana) — that would be genuine over-engineering for a single-office
app with no dedicated IT staff (same reasoning as §13 below).

Verified this session: the exact per-table query (row count + `pg_total_relation_size` +
`pg_size_pretty`) and the database-size query were run against the same disposable, fully-migrated
Postgres container used to verify §13e — all 14 tables resolved correctly against the real schema.

## 13. Alerting — explicit decision

An infra audit flagged "no alerting" — health checks are pull-based only (`docker compose ps`,
`/api/health`), nothing pushes a notification if a container goes unhealthy or disk fills up.

**Explicit decision: no email/SMS/cloud alerting integration.** That would mean a new external
dependency and new secrets (SMTP credentials, a webhook URL, a third-party account) for a
single-office LOCAL app with no dedicated IT staff — against `CLAUDE.md §4`'s non-goals. This is
recorded here as a deliberate choice, not a silent gap.

**Middle ground: `scripts/check-health.sh`.** Zero new dependency (just `docker`/`docker compose`,
already required), checks every service's container status and Docker healthcheck result plus host
disk usage, prints `OK`/`WARN` lines, exits non-zero if anything's wrong. Run it manually, or
schedule it (cron on Linux, Task Scheduler if the server is Windows) if the office wants a periodic
check — nothing is pushed anywhere automatically; that decision is left to whoever administers the
box, matching how backup off-machine copying (§5) is handled.

## 14. Off-Machine Backup Sync — Second Disk (Automated)

Closes the gap §5 documents: `./backups/db/` and `./backups/attachments/` are bind-mounted onto the
same physical disk as the live database, so a disk failure loses live data and backups together.
This section applies **only if the office server has a second internal disk always mounted** — for
a periodically-connected external/USB drive instead, this design doesn't fit as-is (it assumes the
target is present every run) and would need re-spec'ing around on-connect detection.

### Design

`scripts/offsite-sync.sh`, run on the **host** (not a container) via cron — the backup files already
exist as plain files on the host filesystem via the existing bind mounts, so no Docker/container
access is needed to move them. Three decisions worth calling out explicitly:

1. **No `rsync --delete`.** A 1:1 delete-mirroring sync would propagate a bad event on the source
   (accidental `rm`, a bug, ransomware with a foothold on the server) straight onto the one copy
   meant to survive it. Instead the mirror only accumulates, and is pruned on its **own** longer,
   independent retention window — 90 days by default (`MIRROR_RETENTION_DAYS`), well past the
   primary's 14-day daily retention (`docker-compose.yml`'s `backup` service) — so a bad event on
   the primary disk still leaves real recovery material on the second disk.
2. **Mount-check guard.** If the second disk ever fails to mount after a reboot (fstab typo, cable,
   disk pulled), the target directory would still exist as an empty folder — on the root disk.
   Syncing into it would "succeed" while silently writing onto the exact disk this is meant to
   protect against. The script refuses to run (`mountpoint -q`) unless the target is a genuinely
   separate mounted filesystem.
3. **Residual risk, stated plainly**: this protects against *disk* failure only. It does **not**
   protect against the whole server chassis being lost — fire, theft, flood take out both disks at
   once. That's the tradeoff accepted by choosing "second internal disk" over a periodically
   disconnected external drive; the manual off-machine copy in §5 is still the only defense against
   that class of event and is still recommended alongside this, not replaced by it.

### One-time setup per office

1. Physically install and format a second disk.
2. Mount it via `/etc/fstab` using its UUID (`blkid`), not `/dev/sdX` (device names can shift
   across reboots):
   ```
   UUID=xxxx-xxxx-xxxx  /mnt/backup-disk  ext4  defaults  0  2
   ```
3. Install `rsync` if not already present (`apt install rsync` / `dnf install rsync`).
4. Add to `crontab -e` (runs at 03:30, safely after the daily `backup`/`attachments-backup`
   containers finish around midnight):
   ```
   OFFSITE_BACKUP_DIR=/mnt/backup-disk/notary-backups
   30 3 * * * cd /path/to/notary_accounting && sh scripts/offsite-sync.sh >> /var/log/notary-offsite-sync.log 2>&1
   ```
   Setting `OFFSITE_BACKUP_DIR` at the crontab level (not just relying on the script's own default)
   lets `scripts/check-health.sh` pick up the same value and report mirror staleness — that check is
   opt-in and silent unless this variable is exported, so deployments that haven't set this up see no
   change in `check-health.sh` output.
5. Verify: run `sh scripts/offsite-sync.sh` manually once, confirm it exits 0 and files appear under
   `/mnt/backup-disk/notary-backups`. Periodically re-run `scripts/restore-drill.sh` pointed at a
   dump from the mirror path (not just the primary) to confirm the copies themselves are genuinely
   restorable, not just present.

### What this does not do

- Does not touch `docker-compose.yml` — no new service, no new container.
- Does not add a cloud/NAS dependency — stays entirely inside the office's own hardware
  (`CLAUDE.md §4`).
- Does not replace the manual truly-off-site copy in §5 — that remains the only mitigation for
  losing the whole server, not just one disk.
