#!/bin/sh
# Minimal, zero-dependency local health check — no new package, no cloud
# service, no SMTP/webhook credentials to manage. Deliberate scope: an
# infra audit flagged "no alerting" as worth an explicit decision rather
# than silence. The explicit decision (see docs/DEPLOYMENT.md "Alerting")
# is NOT to add email/SMS/cloud alerting — that would mean a new external
# dependency and new secrets for a single-office LOCAL app with no
# dedicated IT staff (CLAUDE.md §4 non-goals). This script is the
# middle ground: run it manually, or schedule it (cron / Task Scheduler)
# if the office wants a periodic check — output is plain text to stdout,
# nothing is pushed anywhere automatically.
#
# Usage: sh scripts/check-health.sh
# Exit code 0 = all OK, 1 = at least one problem found (so cron/Task
# Scheduler can react to the exit code if the office wires that up later).
set -eu

cd "$(dirname "$0")/.."

SERVICES="db app caddy backup attachments-backup"
PROBLEMS=0

for svc in $SERVICES; do
  cid=$(docker compose ps -q "$svc" 2>/dev/null || true)
  if [ -z "$cid" ]; then
    echo "WARN: $svc has no running container"
    PROBLEMS=1
    continue
  fi
  status=$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null || echo "unknown")
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$cid" 2>/dev/null || echo "unknown")
  if [ "$status" != "running" ]; then
    echo "WARN: $svc container status=$status"
    PROBLEMS=1
  elif [ "$health" = "unhealthy" ]; then
    echo "WARN: $svc healthcheck=unhealthy"
    PROBLEMS=1
  fi
done

DISK_USE=$(df -P . | awk 'NR==2 {gsub("%","",$5); print $5}')
case "$DISK_USE" in
  ''|*[!0-9]*) DISK_USE="" ;; # non-numeric (unexpected df output) — skip the check rather than error out
esac
if [ -n "$DISK_USE" ] && [ "$DISK_USE" -ge 85 ]; then
  echo "WARN: host disk at ${DISK_USE}% on $(pwd)"
  PROBLEMS=1
fi

# Opt-in: only checked if the office has actually set up offsite-sync.sh
# (docs/DEPLOYMENT.md §14) and exported OFFSITE_BACKUP_DIR — deployments
# that haven't adopted it see no behavior change here.
if [ -n "${OFFSITE_BACKUP_DIR:-}" ]; then
  if [ ! -d "$OFFSITE_BACKUP_DIR" ]; then
    echo "WARN: OFFSITE_BACKUP_DIR is set but $OFFSITE_BACKUP_DIR does not exist"
    PROBLEMS=1
  elif [ -z "$(find "$OFFSITE_BACKUP_DIR" -type f -mmin -2880 2>/dev/null)" ]; then
    echo "WARN: offsite mirror ($OFFSITE_BACKUP_DIR) has no file synced in the last 48h"
    PROBLEMS=1
  fi
fi

if [ "$PROBLEMS" -eq 0 ]; then
  echo "OK: all services healthy, disk ${DISK_USE:-unknown}% used"
fi

exit $PROBLEMS
