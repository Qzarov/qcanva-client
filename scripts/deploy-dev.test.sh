#!/usr/bin/env bash
# scripts/deploy-dev.sh against a local folder standing in for the server.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

FRONT="$TEST_ROOT/front"
mkdir -p "$FRONT/dist"
printf 'old build' > "$FRONT/dist/index.html"

assert_equals() {
  if [[ "$1" != "$2" ]]; then
    printf 'Expected %q, got %q (%s)\n' "$1" "$2" "$3" >&2
    exit 1
  fi
}

built() {
  local dir="$TEST_ROOT/build-$1"
  mkdir -p "$dir/assets"
  printf '%s' "$1" > "$dir/index.html"
  printf 'fetch("%s")' "${2:-/api}" > "$dir/assets/index.js"
  printf '%s' "$dir"
}

deploy() {
  DEV_HOST=local DEV_ROOT="$FRONT" DEPLOY_DIST="$1" bash "$REPO_ROOT/scripts/deploy-dev.sh" "${@:2}" >/dev/null
}

# A deploy puts the new build in place and keeps the old one beside it.
deploy "$(built one)"
assert_equals 'one' "$(cat "$FRONT/dist/index.html")" 'the new build is served'
assert_equals 'old build' "$(cat "$FRONT"/dist.prev-*/index.html)" 'the old build is kept'
[[ ! -e "$FRONT/dist.next" ]] || { echo 'dist.next is left behind' >&2; exit 1; }

# Only the newest previous builds are kept, even several within a second.
for name in two three four five; do deploy "$(built "$name")"; done
assert_equals 'five' "$(cat "$FRONT/dist/index.html")" 'the latest build is served'
assert_equals '3' "$(ls -1d "$FRONT"/dist.prev-* | wc -l | tr -d ' ')" 'three previous builds are kept'
newest_previous="$(ls -1d "$FRONT"/dist.prev-* | sort | tail -n 1)"
assert_equals 'four' "$(cat "$newest_previous/index.html")" 'the newest previous build is the one before'

# A build that talks to the production API never reaches the stand.
if deploy "$(built prod 'https://qcanva.qzarov.pro/api')" 2>/dev/null; then
  echo 'a build pointing at production was deployed' >&2
  exit 1
fi
assert_equals 'five' "$(cat "$FRONT/dist/index.html")" 'the stand is untouched after a refused build'

# Rollback brings back the build before.
DEV_HOST=local DEV_ROOT="$FRONT" bash "$REPO_ROOT/scripts/deploy-dev.sh" rollback >/dev/null
assert_equals 'four' "$(cat "$FRONT/dist/index.html")" 'rollback serves the previous build'
assert_equals 'five' "$(cat "$FRONT/dist.rolledback/index.html")" 'the replaced build is set aside'

# Without a host it says what is missing.
if DEV_HOST='' bash "$REPO_ROOT/scripts/deploy-dev.sh" 2>"$TEST_ROOT/err"; then
  echo 'deployed without DEV_HOST' >&2
  exit 1
fi
grep -q 'set DEV_HOST' "$TEST_ROOT/err"

echo 'deploy-dev: ok'
