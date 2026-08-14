#!/bin/sh
# Off-machine backup sync — copies ./backups/ (db dumps + attachment tars,
# both already bind-mounted onto THIS disk by docker-compose.yml's `backup`/
# `attachments-backup` services) onto a second, always-mounted internal disk.
# Runs on the HOST, not in a container — the files already exist as plain
# files on this filesystem, so no Docker/container access is needed for a
# straight copy (reuse before build, CLAUDE.md §7.6).
#
# Closes the gap flagged in docs/DEPLOYMENT.md §5 "Off-machine copy": the
# `backup`/`attachments-backup` services and the live database all live on
# the SAME physical disk today — a disk failure loses backups and live data
# together. This script does NOT protect against fire/theft/flood taking out
# the whole server chassis (that needs a periodically-disconnected external
# drive or a true off-site copy instead) — see docs/DEPLOYMENT.md §14 for the
# full tradeoff this accepted.
#
# Deliberately NOT a 1:1 `rsync --delete` mirror: if the source backups are
# ever deleted or corrupted (bad actor, ransomware, accidental `rm`), a
# delete-propagating sync would happily copy that deletion onto the one copy
# meant to survive it. Instead this only adds/updates, and prunes the MIRROR
# on its own longer, independent retention window (MIRROR_RETENTION_DAYS
# below) — so a bad event on the primary disk still leaves real recovery
# material on the second disk for up to that long.
#
# Usage: sh scripts/offsite-sync.sh
# Exit 0 = synced OK. Exit 1 = target not mounted / rsync failed / target
# disk critically full — logged to stdout/stderr, status also feeds
# scripts/check-health.sh if OFFSITE_BACKUP_DIR is exported there too.
#
# Prerequisites (one-time host setup, not automated by this repo):
#   - A second disk physically installed and formatted.
#   - Mounted via /etc/fstab using its UUID (`blkid`), not /dev/sdX (device
#     names can shift across reboots) — e.g.:
#       UUID=xxxx-xxxx-xxxx  /mnt/backup-disk  ext4  defaults  0  2
#   - `rsync` installed (`apt install rsync` / `dnf install rsync` — not
#     present on every minimal base install).
#   - Scheduled via host cron, run AFTER the daily backup/attachments-backup
#     containers finish (they run around midnight). Example `crontab -e`:
#       OFFSITE_BACKUP_DIR=/mnt/backup-disk/notary-backups
#       30 3 * * * cd /path/to/notary_accounting && sh scripts/offsite-sync.sh >> /var/log/notary-offsite-sync.log 2>&1
#     (Setting OFFSITE_BACKUP_DIR at the crontab level, not just inline here,
#     lets scripts/check-health.sh pick up the same value if it's run from
#     the same crontab.)
set -eu

cd "$(dirname "$0")/.."

SOURCE_DIR="./backups"
TARGET_DIR="${OFFSITE_BACKUP_DIR:-/mnt/backup-disk/notary-backups}"
MIRROR_RETENTION_DAYS="${MIRROR_RETENTION_DAYS:-90}"
MIN_FREE_PCT=10

TARGET_MOUNT_ROOT=$(dirname "$TARGET_DIR")

# Guard 1: refuse to sync onto a path that isn't actually a separate mounted
# filesystem — see header comment. Checked on the parent dir since
# TARGET_DIR itself (a subfolder) won't exist yet on first run.
if ! mountpoint -q "$TARGET_MOUNT_ROOT" 2>/dev/null; then
  echo "ERROR: $TARGET_MOUNT_ROOT is not a mounted filesystem — refusing to sync (see scripts/offsite-sync.sh prerequisites)" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

# Guard 2: don't let rsync run against a target disk that's already nearly
# full — a partial write is worse than an honest failure here.
TARGET_USE=$(df -P "$TARGET_DIR" | awk 'NR==2 {gsub("%","",$5); print $5}')
case "$TARGET_USE" in
  ''|*[!0-9]*) TARGET_USE="" ;; # non-numeric (unexpected df output) — skip the check rather than error out
esac
if [ -n "$TARGET_USE" ] && [ "$TARGET_USE" -ge $((100 - MIN_FREE_PCT)) ]; then
  echo "ERROR: offsite disk at ${TARGET_USE}% used, refusing to sync (see MIN_FREE_PCT)" >&2
  exit 1
fi

echo "$(date -Is) Syncing $SOURCE_DIR -> $TARGET_DIR ..."
rsync -a --stats "$SOURCE_DIR"/ "$TARGET_DIR"/

echo "$(date -Is) Pruning mirror entries older than ${MIRROR_RETENTION_DAYS}d ..."
find "$TARGET_DIR" -type f -mtime "+${MIRROR_RETENTION_DAYS}" -delete

echo "$(date -Is) Offsite sync OK."
