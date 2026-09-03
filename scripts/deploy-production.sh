#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$REPO_DIR/.." && pwd)}"
RELEASES_DIR="$DEPLOY_ROOT/releases"
DIST_LINK="$DEPLOY_ROOT/dist"
PREVIOUS_LINK="$DEPLOY_ROOT/dist.previous"
RELEASE_ID="${RELEASE_ID:-}"

fail() {
  printf 'Deploy failed: %s\n' "$*" >&2
  exit 1
}

link_atomically() {
  local target="$1"
  local link_path="$2"
  local next_link="${link_path}.next.$$"

  ln -s "$target" "$next_link"
  mv -Tf "$next_link" "$link_path"
}

link_target() {
  readlink -f "$1"
}

ensure_release_dir() {
  mkdir -p "$RELEASES_DIR"

  if [[ -d "$DIST_LINK" && ! -L "$DIST_LINK" ]]; then
    local legacy_release="$RELEASES_DIR/legacy-$(date +%Y%m%d-%H%M%S)"
    mv "$DIST_LINK" "$legacy_release"
    link_atomically "$legacy_release" "$PREVIOUS_LINK"
    link_atomically "$legacy_release" "$DIST_LINK"
  fi

  [[ -L "$DIST_LINK" ]] || fail "$DIST_LINK must be a release symlink"
  [[ -L "$PREVIOUS_LINK" ]] || fail "$PREVIOUS_LINK must point to the rollback release"
}

prune_releases() {
  local active_release previous_release release
  active_release="$(link_target "$DIST_LINK")"
  previous_release="$(link_target "$PREVIOUS_LINK")"

  while IFS= read -r -d '' release; do
    [[ "$release" == "$active_release" || "$release" == "$previous_release" ]] || rm -rf -- "$release"
  done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -print0)
}

rollback() {
  [[ -L "$DIST_LINK" && -L "$PREVIOUS_LINK" ]] || fail 'active and previous release links are required'

  local active_release previous_release
  active_release="$(link_target "$DIST_LINK")"
  previous_release="$(link_target "$PREVIOUS_LINK")"
  [[ -f "$active_release/index.html" ]] || fail "active release is incomplete: $active_release"
  [[ -f "$previous_release/index.html" ]] || fail "previous release is incomplete: $previous_release"

  link_atomically "$previous_release" "$DIST_LINK"
  link_atomically "$active_release" "$PREVIOUS_LINK"
  printf 'Rolled back to %s\n' "$(basename "$previous_release")"
}

deploy() {
  cd "$REPO_DIR"
  git diff --quiet || fail 'repository has unstaged changes'
  git diff --cached --quiet || fail 'repository has staged changes'
  git pull --ff-only origin dev
  npm ci
  npm run test:unit
  npm run build

  RELEASE_ID="${RELEASE_ID:-$(git rev-parse --short HEAD)-$(date +%Y%m%d-%H%M%S)}"
  [[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || fail "invalid release id: $RELEASE_ID"
  [[ -f "$REPO_DIR/dist/index.html" ]] || fail 'build did not produce dist/index.html'

  ensure_release_dir

  local release_dir="$RELEASES_DIR/$RELEASE_ID"
  local staging_dir="$RELEASES_DIR/.${RELEASE_ID}.staging.$$"
  [[ ! -e "$release_dir" ]] || fail "release already exists: $release_dir"
  mkdir "$staging_dir"
  cp -a "$REPO_DIR/dist/." "$staging_dir/"
  [[ -f "$staging_dir/index.html" ]] || fail 'staging release is incomplete'
  mv "$staging_dir" "$release_dir"

  local previous_release
  previous_release="$(link_target "$DIST_LINK")"
  link_atomically "$previous_release" "$PREVIOUS_LINK"
  link_atomically "$release_dir" "$DIST_LINK"
  prune_releases

  printf 'Deployed %s; rollback release: %s\n' "$RELEASE_ID" "$(basename "$previous_release")"
}

case "${1:-deploy}" in
  deploy) deploy ;;
  rollback) rollback ;;
  *) fail "usage: $0 [deploy|rollback]" ;;
esac
