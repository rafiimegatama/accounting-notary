#!/bin/sh
# Builds and deploys the `app` image tagged with the current git commit SHA
# (not just `:latest`) so a bad deploy can be rolled back with a plain
# `docker compose up` (scripts/rollback.sh), not a rebuild against a commit
# that may no longer build cleanly the exact same way (base image drift,
# registry hiccup, etc.) — see docs/DEPLOYMENT.md §13d. Keeps the last
# KEEP_IMAGES tagged builds around; older ones are pruned automatically
# after each successful deploy.
#
# Usage: sh scripts/deploy.sh [--allow-dirty]
set -eu

cd "$(dirname "$0")/.."

KEEP_IMAGES=3
IMAGE_REPO="notary-accounting-app"

if [ "${1:-}" != "--allow-dirty" ] && [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: working tree has uncommitted changes." >&2
  echo "A git-SHA-tagged image must correspond to an actual commit, or rollback-by-SHA is meaningless." >&2
  echo "Commit first, or re-run with --allow-dirty to override (not recommended for a real deploy)." >&2
  exit 1
fi

GIT_SHA=$(git rev-parse --short=12 HEAD)
echo "Building ${IMAGE_REPO}:${GIT_SHA} ..."

APP_IMAGE_TAG="$GIT_SHA" docker compose build app
docker tag "${IMAGE_REPO}:${GIT_SHA}" "${IMAGE_REPO}:latest"

echo "Starting stack on ${IMAGE_REPO}:${GIT_SHA} (also tagged :latest) ..."
APP_IMAGE_TAG="$GIT_SHA" docker compose up -d

echo ""
echo "Deployed ${IMAGE_REPO}:${GIT_SHA}. To roll back later:"
echo "  sh scripts/rollback.sh ${GIT_SHA}   # or an older tag — see: docker images ${IMAGE_REPO}"

echo ""
echo "Pruning old builds beyond the last ${KEEP_IMAGES} (by build time, 'latest' excluded — it's just a pointer at the newest one) ..."
docker images "${IMAGE_REPO}" --format '{{.CreatedAt}}|{{.Tag}}' \
  | grep -v '|latest$' \
  | sort -r \
  | tail -n "+$((KEEP_IMAGES + 1))" \
  | cut -d'|' -f2 \
  | while read -r old_tag; do
      [ -z "$old_tag" ] && continue
      echo "  removing ${IMAGE_REPO}:${old_tag}"
      docker rmi "${IMAGE_REPO}:${old_tag}" >/dev/null 2>&1 || true
    done

echo ""
echo "Kept builds:"
docker images "${IMAGE_REPO}" --format '  {{.Tag}}  ({{.CreatedSince}})'
echo ""
echo "Verify: curl -s http://localhost:3000/api/health"
