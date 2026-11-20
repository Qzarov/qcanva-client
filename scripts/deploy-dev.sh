#!/usr/bin/env bash
# The dev stand (dev-qcanva.qzarov.pro): build `dev` and put it there.
# Runs on a developer's machine, not on the server: the server keeps only the
# built site in $DEV_ROOT/dist (nginx serves it), the previous builds beside it
# as dist.prev-<time>.
#
#   DEV_HOST=user@server bash scripts/deploy-dev.sh            # deploy origin/dev
#   DEV_HOST=user@server bash scripts/deploy-dev.sh rollback   # back to the previous build
#
# The build happens in a throwaway worktree at $DEPLOY_REF, so nothing
# uncommitted in this checkout can end up on the stand.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
# user@host of the dev server; "local" runs the server side on this machine (tests).
DEV_HOST="${DEV_HOST:-}"
DEV_ROOT="${DEV_ROOT:-/var/www/qcanva-dev/front}"
DEPLOY_REF="${DEPLOY_REF:-origin/dev}"
KEEP_PREVIOUS="${KEEP_PREVIOUS:-3}"
# An already built site to ship as is: skips the checkout, the tests and the build.
DEPLOY_DIST="${DEPLOY_DIST:-}"
# A dev build must never talk to production (see .env.dev).
PROD_API_URL='https://qcanva.qzarov.pro/api'

WORK_DIR=''
BUILT_DIST=''

fail() {
  printf 'Dev deploy failed: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  [[ -n "$WORK_DIR" ]] || return 0
  git -C "$REPO_DIR" worktree remove --force "$WORK_DIR/tree" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

on_server() {
  if [[ "$DEV_HOST" == local ]]; then
    bash -c "$1"
  else
    ssh -o BatchMode=yes "$DEV_HOST" "$1"
  fi
}

upload() {
  if [[ "$DEV_HOST" == local ]]; then
    rsync -a --delete "$1/" "$2/"
  else
    rsync -az --delete -e 'ssh -o BatchMode=yes' "$1/" "$DEV_HOST:$2/"
  fi
}

# Builds $DEPLOY_REF into BUILT_DIST (not in a subshell: cleanup needs WORK_DIR).
build() {
  git -C "$REPO_DIR" fetch --quiet origin
  local commit
  commit="$(git -C "$REPO_DIR" rev-parse --verify "$DEPLOY_REF^{commit}")" || fail "no such ref: $DEPLOY_REF"
  WORK_DIR="$(mktemp -d)"
  git -C "$REPO_DIR" worktree add --detach --quiet "$WORK_DIR/tree" "$commit"
  printf 'Building %s (%s)\n' "$DEPLOY_REF" "$(git -C "$REPO_DIR" log -1 --format='%h %s' "$commit")" >&2
  (
    cd "$WORK_DIR/tree"
    npm ci --no-audit --no-fund >&2
    npm run test:unit >&2
    npm run build:dev >&2
  )
  # What is on the stand, for anyone who wonders: /deploy-commit.txt.
  printf '%s\n' "$commit" > "$WORK_DIR/tree/dist/deploy-commit.txt"
  BUILT_DIST="$WORK_DIR/tree/dist"
}

check_dist() {
  local dist="$1"
  [[ -f "$dist/index.html" ]] || fail "$dist has no index.html"
  if grep -rqF "$PROD_API_URL" "$dist"; then
    fail "the build points at the production API ($PROD_API_URL); build with --mode dev"
  fi
}

deploy() {
  [[ -n "$DEV_HOST" ]] || fail 'set DEV_HOST=user@server (the dev server)'
  on_server "test -d '$DEV_ROOT'" || fail "$DEV_ROOT is not on $DEV_HOST"

  local dist="$DEPLOY_DIST"
  if [[ -z "$dist" ]]; then
    build
    dist="$BUILT_DIST"
  fi
  check_dist "$dist"

  upload "$dist" "$DEV_ROOT/dist.next"
  # Two renames: the old build steps aside, the new one takes its place.
  on_server "set -euo pipefail
    cd '$DEV_ROOT'
    stamp=\$(date +%Y%m%d-%H%M%S)
    previous=dist.prev-\$stamp
    n=1
    while [ -e \"\$previous\" ]; do n=\$((n + 1)); previous=dist.prev-\$stamp-\$n; done
    if [ -d dist ]; then mv dist \"\$previous\"; fi
    mv dist.next dist
    ls -1d dist.prev-* 2>/dev/null | sort -r | tail -n +$((KEEP_PREVIOUS + 1)) | while read -r old; do rm -rf -- \"\$old\"; done"
  printf 'Deployed to %s:%s/dist\n' "$DEV_HOST" "$DEV_ROOT"
}

rollback() {
  [[ -n "$DEV_HOST" ]] || fail 'set DEV_HOST=user@server (the dev server)'
  on_server "set -euo pipefail
    cd '$DEV_ROOT'
    previous=\$(ls -1d dist.prev-* 2>/dev/null | sort | tail -n 1)
    [ -n \"\$previous\" ] || { echo 'Dev deploy failed: no previous build to roll back to' >&2; exit 1; }
    rm -rf dist.rolledback
    mv dist dist.rolledback
    mv \"\$previous\" dist
    echo \"Rolled back to \$previous (the build it replaced is in dist.rolledback)\""
}

case "${1:-deploy}" in
  deploy) deploy ;;
  rollback) rollback ;;
  *) fail "unknown command: $1 (deploy | rollback)" ;;
esac
