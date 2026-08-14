#!/bin/sh
# Non-destructive backup restore drill — proves the daily pg_dump output
# (docker-compose.yml `backup` service) is actually restorable, not just
# present on disk. An untested backup is not a real backup. Restores into
# a disposable scratch database and drops it afterward; the live
# `notary_financial_control` database is never touched.
#
# Usage: sh scripts/restore-drill.sh [path-to-dump.sql.gz]
# Defaults to the most recent daily dump if no path is given. Run this
# periodically (see docs/DEPLOYMENT.md "Backup") — a dump that silently
# stopped being restorable (corrupt file, format change, permission
# issue) is only caught by actually restoring it, not by it existing.
set -eu

cd "$(dirname "$0")/.."

DUMP="${1:-./backups/db/daily/notary_financial_control-latest.sql.gz}"
SCRATCH_DB="notary_financial_control_restore_drill"

if [ ! -f "$DUMP" ]; then
  echo "No dump found at $DUMP" >&2
  exit 1
fi

echo "Restoring $DUMP into scratch database '$SCRATCH_DB' (live DB untouched)..."

docker compose exec -T db psql -U notary_app -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${SCRATCH_DB};"
docker compose exec -T db psql -U notary_app -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${SCRATCH_DB};"
gunzip -c "$DUMP" | docker compose exec -T db psql -U notary_app -d "$SCRATCH_DB" -v ON_ERROR_STOP=1

echo ""
echo "Restore completed. Sanity-checking row counts against the scratch database:"
docker compose exec -T db psql -U notary_app -d "$SCRATCH_DB" -c "
  SELECT 'staff' AS table_name, count(*) FROM staff
  UNION ALL SELECT 'client', count(*) FROM client
  UNION ALL SELECT 'matter', count(*) FROM matter
  UNION ALL SELECT 'financial_transaction', count(*) FROM financial_transaction
  UNION ALL SELECT 'audit_log', count(*) FROM audit_log;
"

echo "Dropping scratch database..."
docker compose exec -T db psql -U notary_app -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${SCRATCH_DB};"

echo "Restore drill OK — dump is genuinely restorable."
