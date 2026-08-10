#!/bin/sh
# Recreates the test database from scratch before every test run.
#
# Why not just DELETE FROM ... between tests: the schema deliberately
# blocks DELETE on every financial table (Step 11 triggers) so the app
# can never destroy financial history. That's correct for the running
# system, but it means row-level cleanup between test runs is impossible
# by design. DROP DATABASE/CREATE DATABASE is DDL, not DML — it bypasses
# those triggers entirely and gives each test run a genuinely clean slate,
# without weakening the guarantee for the real app.
set -e

cd "$(dirname "$0")/.."

docker compose exec -T db psql -U notary_app -d postgres -c "DROP DATABASE IF EXISTS notary_financial_control_test;"
docker compose exec -T db psql -U notary_app -d postgres -c "CREATE DATABASE notary_financial_control_test;"

TEST_DATABASE_URL="postgresql://notary_app:${POSTGRES_PASSWORD:-changeme_dev_only}@localhost:5432/notary_financial_control_test?schema=public"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
