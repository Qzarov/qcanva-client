#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

FRONT_ROOT="$TEST_ROOT/front"
REPO_DIR="$FRONT_ROOT/repo"
FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$REPO_DIR" "$FAKE_BIN" "$FRONT_ROOT/dist/assets"
printf 'legacy build' > "$FRONT_ROOT/dist/index.html"

cat > "$FAKE_BIN/git" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "rev-parse" ]]; then
  printf 'test-commit\n'
fi
EOF
chmod +x "$FAKE_BIN/git"

cat > "$FAKE_BIN/npm" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "run" && "$2" == "build" ]]; then
  mkdir -p dist/assets
  printf 'new build %s' "${RELEASE_ID:?}" > dist/index.html
fi
EOF
chmod +x "$FAKE_BIN/npm"

run_deploy() {
  PATH="$FAKE_BIN:$PATH" \
    DEPLOY_ROOT="$FRONT_ROOT" \
    REPO_DIR="$REPO_DIR" \
    RELEASE_ID="$1" \
    bash "$REPO_ROOT/scripts/deploy-production.sh"
}

run_deploy release-one
[[ -L "$FRONT_ROOT/dist" ]]
[[ -L "$FRONT_ROOT/dist.previous" ]]
[[ "$(cat "$FRONT_ROOT/dist/index.html")" == "new build release-one" ]]
[[ "$(cat "$FRONT_ROOT/dist.previous/index.html")" == "legacy build" ]]

run_deploy release-two
[[ "$(cat "$FRONT_ROOT/dist/index.html")" == "new build release-two" ]]
[[ "$(cat "$FRONT_ROOT/dist.previous/index.html")" == "new build release-one" ]]
[[ ! -e "$FRONT_ROOT/releases/legacy" ]]
[[ "$(find "$FRONT_ROOT/releases" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" == "2" ]]

PATH="$FAKE_BIN:$PATH" \
  DEPLOY_ROOT="$FRONT_ROOT" \
  REPO_DIR="$REPO_DIR" \
  bash "$REPO_ROOT/scripts/deploy-production.sh" rollback

[[ "$(cat "$FRONT_ROOT/dist/index.html")" == "new build release-one" ]]
[[ "$(cat "$FRONT_ROOT/dist.previous/index.html")" == "new build release-two" ]]
printf 'deploy-production test passed\n'
