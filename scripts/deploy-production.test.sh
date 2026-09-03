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

# The deploy now gates on the node inventory matching canvas-server-back, so
# the fake repo needs the check script and a contract for it to compare.
mkdir -p "$REPO_DIR/scripts" "$REPO_DIR/src/documents"
cp "$REPO_ROOT/scripts/check-schema-contract.sh" "$REPO_DIR/scripts/"
write_contract() {
  printf 'export const EXPECTED_SCHEMA =\n  "%s";\n' "$2" > "$1"
}
write_contract "$REPO_DIR/src/documents/schema-contract.ts" 'paragraph|block|p|||'
BACK_CONTRACT_FILE="$TEST_ROOT/back-schema-contract.ts"
write_contract "$BACK_CONTRACT_FILE" 'paragraph|block|p|||'

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
    BACK_CONTRACT="$BACK_CONTRACT_FILE" \
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

# A node inventory that disagrees with the backend must stop the deploy, since
# the two halves would render the same document differently. This is the whole
# reason the gate exists: no test inside either repository can see the drift.
write_contract "$BACK_CONTRACT_FILE" 'paragraph|block|p|||\ncallout|block|aside||variant|'
if run_deploy release-drift >/dev/null 2>&1; then
  printf 'expected the deploy to fail on a schema mismatch\n' >&2
  exit 1
fi
# The active release must be untouched by the refused deploy.
[[ "$(basename "$(readlink -f "$FRONT_ROOT/dist")")" != "release-drift" ]]

# Deliberate, acknowledged drift still has a way through.
ALLOW_SCHEMA_DRIFT=1 run_deploy release-override >/dev/null
[[ "$(basename "$(readlink -f "$FRONT_ROOT/dist")")" == "release-override" ]]

write_contract "$BACK_CONTRACT_FILE" 'paragraph|block|p|||'

printf 'deploy-production.sh: schema gate ok\n'
