#!/bin/sh
# Last-resort PIN reset for when EVERY admin account is locked out and
# nobody can use the in-app Reset PIN feature (Settings > Staf Aktif,
# src/components/StaffList.tsx, POST /api/staff/[id]/reset-pin) to help
# each other. Requires direct server/Docker access on purpose — this is
# intentionally NOT reachable from the web app, matching the "no SMTP /
# no self-service email recovery" decision (CHANGELOG.md v40): a
# break-glass path that only someone with actual server access can trigger
# is safer than a self-service one reachable by anyone who can reach the
# login page.
#
# Computes the new PIN's hash using the exact same algorithm the app
# itself uses (scrypt, src/lib/session.ts's hashPin() — salt: 16 random
# bytes as hex, hash: scryptSync(pin, salt, 64) as hex) so the result is
# guaranteed to actually verify at login, not just "look like" a valid
# hash. Run via plain Node builtins inside the `app` container (not a
# TypeScript import of src/lib/session.ts) because the production image
# only ships compiled `.next` output, not raw `src/` files — see
# Dockerfile's `runner` stage.
#
# Usage: sh scripts/break-glass-reset-pin.sh "<exact staff name>"
set -eu

cd "$(dirname "$0")/.."

STAFF_NAME="${1:?Usage: sh scripts/break-glass-reset-pin.sh \"<exact staff name>\"}"

echo "=== Break-glass PIN reset ==="
echo "Target: ${STAFF_NAME}"
echo "This bypasses the app's own admin check entirely — only use it when no"
echo "admin account can log in to do this the normal way (Settings > Staf Aktif)."
echo ""
printf "Type the staff name again to confirm: "
read -r CONFIRM
if [ "$CONFIRM" != "$STAFF_NAME" ]; then
  echo "Confirmation did not match — aborting, nothing changed." >&2
  exit 1
fi

# Confirm exactly one ACTIVE staff member matches before generating
# anything — refuses to silently no-op (typo'd name) or touch multiple
# rows (name collision). Uses -v/stdin (not raw string interpolation into
# -c) for the same reason as the UPDATE below: a name containing a quote
# character must not need special-casing here.
MATCH_COUNT=$(docker compose exec -T db psql -U notary_app -d notary_financial_control -tA \
  -v staffname="$STAFF_NAME" <<'SQL' | tr -d '[:space:]'
SELECT count(*) FROM staff WHERE name = :'staffname' AND status = 'ACTIVE';
SQL
)
if [ "$MATCH_COUNT" != "1" ]; then
  echo "ERROR: expected exactly 1 ACTIVE staff member named '${STAFF_NAME}', found ${MATCH_COUNT}." >&2
  echo "Check the exact spelling (case-sensitive, no fuzzy match on purpose)." >&2
  exit 1
fi

# Generate PIN + salt + hash as one atomic step (a fresh, throwaway `node`
# process inside the container — not the running server process, so this
# cannot reach into or clear the running server's in-memory login-lockout
# state; see the note printed at the end).
RESULT=$(docker compose exec -T app node -e "
  const crypto = require('crypto');
  const pin = Array.from({length: 6}, () => crypto.randomInt(0, 10)).join('');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 64).toString('hex');
  console.log(pin + '|' + hash + '|' + salt);
")

NEW_PIN=$(echo "$RESULT" | cut -d'|' -f1)
HASH=$(echo "$RESULT" | cut -d'|' -f2)
SALT=$(echo "$RESULT" | cut -d'|' -f3)

# Piped via stdin, not `-c "..."` — psql's `:'var'` substitution into SQL
# text (as opposed to backslash meta-commands like `\echo`) only applies
# when psql reads a script (stdin/-f), NOT `-c`'s command-string mode.
# Confirmed by direct testing: `-c "SELECT :'x';"` raises a syntax error,
# the identical statement piped via stdin works — matches the
# stdin-piping pattern this project's scripts/migrate.sh and
# scripts/restore-drill.sh already use for docker compose exec -T db.
docker compose exec -T db psql -U notary_app -d notary_financial_control \
  -v staffname="$STAFF_NAME" -v hash="$HASH" -v salt="$SALT" <<'SQL'
UPDATE staff SET pin_hash = :'hash', pin_salt = :'salt' WHERE name = :'staffname';
SQL

docker compose exec -T db psql -U notary_app -d notary_financial_control \
  -v staffname="$STAFF_NAME" <<'SQL'
INSERT INTO audit_log (entity_type, entity_id, action, user_id, reason)
SELECT 'STAFF', id, 'PIN_RESET', 'break-glass-script', 'Break-glass reset — no admin account could log in'
FROM staff WHERE name = :'staffname';
SQL

echo ""
echo "=== Done ==="
echo "New PIN for ${STAFF_NAME}: ${NEW_PIN}"
echo "Shown ONCE, right here — not stored anywhere in plaintext. Relay it now."
echo ""
echo "Note: if ${STAFF_NAME} was ALSO rate-limited from repeated wrong PIN"
echo "attempts (src/lib/loginRateLimit.ts), that lockout lives in the running"
echo "app process's memory, not the database — this script can't clear it"
echo "directly. It expires on its own within 5 minutes, or immediately if the"
echo "app container restarts."
