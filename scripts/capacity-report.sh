#!/bin/sh
# Periodic row-count + table-size snapshot, appended to a CSV log so
# repeated runs (recommended: weekly cron, alongside check-health.sh) build
# a growth trend over time — several of these tables are append-only by
# design (financial_transaction, audit_log, payment_allocation: immutable
# audit trail, CLAUDE.md §7 constraints 5/8) and can only ever grow.
#
# check-health.sh's 85%-disk-used check is reactive (fires only once nearly
# full); this is the predictive counterpart — open the CSV in a spreadsheet
# to see growth rate and project when db_data will need more disk, well
# before hitting that threshold. Zero new dependency (just docker/docker
# compose + Postgres's own pg_total_relation_size/pg_size_pretty), plain CSV
# output, nothing pushed anywhere automatically — same philosophy as
# check-health.sh (docs/DEPLOYMENT.md §13 Alerting).
#
# Usage: sh scripts/capacity-report.sh
set -eu

cd "$(dirname "$0")/.."

LOG_FILE="./backups/capacity-log.csv"
mkdir -p ./backups

# All tables from prisma/schema.prisma's @@map directives — a full picture,
# not a hand-picked subset that could miss where growth actually shows up.
TABLES="staff client matter bank_account invoice cost_detail financial_transaction payment deposit disbursement payment_allocation financial_attachment audit_log system_setting"

TIMESTAMP=$(date -Is)

if [ ! -f "$LOG_FILE" ]; then
  echo "timestamp,table_name,row_count,total_size_bytes" > "$LOG_FILE"
fi

echo "Capacity snapshot @ ${TIMESTAMP}"
printf '%-22s %12s %14s\n' "table" "rows" "size"
printf '%-22s %12s %14s\n' "----------------------" "------------" "--------------"

for t in $TABLES; do
  ROW=$(docker compose exec -T db psql -U notary_app -d notary_financial_control -tAc \
    "SELECT count(*) || '|' || pg_total_relation_size('${t}') || '|' || pg_size_pretty(pg_total_relation_size('${t}')) FROM \"${t}\";" \
    | tr -d '\r')
  ROW_COUNT=$(echo "$ROW" | cut -d'|' -f1)
  SIZE_BYTES=$(echo "$ROW" | cut -d'|' -f2)
  SIZE_HUMAN=$(echo "$ROW" | cut -d'|' -f3)
  printf '%-22s %12s %14s\n' "$t" "$ROW_COUNT" "$SIZE_HUMAN"
  echo "${TIMESTAMP},${t},${ROW_COUNT},${SIZE_BYTES}" >> "$LOG_FILE"
done

DB_SIZE=$(docker compose exec -T db psql -U notary_app -d notary_financial_control -tAc \
  "SELECT pg_size_pretty(pg_database_size('notary_financial_control'));" | tr -d '\r')

echo ""
echo "Total database size: ${DB_SIZE}"
echo ""
echo "Log appended to ${LOG_FILE} (kept indefinitely — it's a small text file, not a backup)."
echo "To see one table's growth over time: grep financial_transaction ${LOG_FILE}"
