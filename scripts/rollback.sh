#!/bin/sh
# Rolls the `app` service back to a previously deployed, already-built image
# — a real `docker compose up`, not a rebuild. See scripts/deploy.sh and
# docs/DEPLOYMENT.md §13d. Only works for a tag deploy.sh's pruning hasn't
# removed yet (the last few builds); anything older needs `git checkout
# <commit>` followed by `sh scripts/deploy.sh` instead.
#
# Usage: sh scripts/rollback.sh <git-sha-tag>
set -eu

cd "$(dirname "$0")/.."

IMAGE_REPO="notary-accounting-app"
TAG="${1:?Usage: sh scripts/rollback.sh <git-sha-tag>  (see: docker images notary-accounting-app)}"

if ! docker image inspect "${IMAGE_REPO}:${TAG}" >/dev/null 2>&1; then
  echo "ERROR: no local image ${IMAGE_REPO}:${TAG} found." >&2
  echo "" >&2
  echo "Available tags:" >&2
  docker images "${IMAGE_REPO}" --format '  {{.Tag}}  ({{.CreatedSince}})' >&2
  echo "" >&2
  echo "If the tag you want isn't listed, it was pruned (deploy.sh only keeps the last few builds) —" >&2
  echo "check out that commit and run 'sh scripts/deploy.sh' again instead." >&2
  exit 1
fi

echo "Rolling back app to ${IMAGE_REPO}:${TAG} ..."
APP_IMAGE_TAG="$TAG" docker compose up -d app

echo ""
echo "Done. Verify: curl -s http://localhost:3000/api/health"
echo "Note: this only switches the app container's image. If the rollback target predates a schema"
echo "migration that already ran, the database is NOT rolled back by this script — see"
echo "docs/DEPLOYMENT.md §6 Rollback for the schema-rollback caveat."
