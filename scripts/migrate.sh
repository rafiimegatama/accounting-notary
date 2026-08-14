#!/bin/sh
# Wraps `prisma migrate deploy` with an immediate pre-migration snapshot —
# closes a real safety gap: the `backup` service (docker-compose.yml) only
# dumps once a day (`SCHEDULE: "@daily"`), so a bad migration run at 2pm
# could lose up to a day of changes if a restore is needed. This snapshot is
# taken seconds before the migration runs, not up to 24h before.
#
# Kept SEPARATE from the scheduled `backup` service's own dumps (different
# directory, own short retention below) — it's a safety net around one
# specific deploy action, not a long-term backup archive; that's still the
# `backup` service's job with its own 14d/8w/6mo retention.
#
# Usage: sh scripts/migrate.sh
set -eu

cd "$(dirname "$0")/.."

PRE_MIGRATION_DIR="./backups/pre-migration"
KEEP=10
STAMP=$(date +%Y%m%d-%H%M%S)
DUMP_FILE="${PRE_MIGRATION_DIR}/pre-migration-${STAMP}.sql.gz"

mkdir -p "$PRE_MIGRATION_DIR"

echo "Taking pre-migration snapshot -> ${DUMP_FILE} ..."
docker compose exec -T db pg_dump -U notary_app notary_financial_control | gzip > "$DUMP_FILE"

if [ ! -s "$DUMP_FILE" ]; then
  echo "ERROR: pre-migration snapshot is empty — refusing to run migrate deploy." >&2
  rm -f "$DUMP_FILE"
  exit 1
fi
echo "Snapshot OK."

echo "Running prisma migrate deploy ..."
docker compose exec -T app npx prisma migrate deploy

echo ""
echo "Migration applied. Pre-migration snapshot kept at: ${DUMP_FILE}"
echo "To roll back this migration's data if something's wrong, restore that file the same way"
echo "scripts/restore-drill.sh does (into a scratch DB first to verify, never directly onto live)."

echo "Pruning pre-migration snapshots beyond the last ${KEEP} ..."
ls -1t "${PRE_MIGRATION_DIR}"/pre-migration-*.sql.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  [ -z "$old" ] && continue
  rm -f "$old"
done
