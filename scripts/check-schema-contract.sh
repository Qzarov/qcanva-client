#!/usr/bin/env bash
#
# The document node inventory is duplicated in this repository and in
# canvas-server-back, and each side pins its own copy against its own committed
# canonical string. That means BOTH test suites pass while the two copies drift
# apart: there is no test that can see across two repositories.
#
# Worse, the local failure actively guides you into completing the drift. Change
# the inventory on one side and its own contract test fails, telling you to
# regenerate its literal — do that and the divergence is now invisible.
#
# So the check lives here, at deploy time, which is the one moment both
# repositories are checked out together on the same machine.
set -euo pipefail

FRONT_CONTRACT="${FRONT_CONTRACT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/documents/schema-contract.ts}"
BACK_CONTRACT="${BACK_CONTRACT:-/var/www/canvas.qzarov.pro/back/src/text-documents/schema/schema-contract.ts}"
EXTRACTOR="$(dirname "${BASH_SOURCE[0]}")/extract-schema-literal.py"

extract() {
  python3 "$EXTRACTOR" "$1"
}

if [[ ! -f "$FRONT_CONTRACT" ]]; then
  printf 'Schema check failed: no frontend contract at %s\n' "$FRONT_CONTRACT" >&2
  exit 1
fi

if [[ ! -f "$BACK_CONTRACT" ]]; then
  # A developer machine may legitimately have only one repository. Say so
  # loudly rather than passing quietly, since a silent skip is how this class
  # of drift survives in the first place.
  printf 'Schema check SKIPPED: no backend contract at %s\n' "$BACK_CONTRACT" >&2
  printf 'Set BACK_CONTRACT to compare, or expect the deploy host to have it.\n' >&2
  exit 0
fi

front="$(extract "$FRONT_CONTRACT")"
back="$(extract "$BACK_CONTRACT")"

if [[ "$front" == "$back" ]]; then
  printf 'Schema contract matches the backend (%d bytes).\n' "${#front}"
  exit 0
fi

printf 'Schema contract MISMATCH between the two repositories.\n' >&2
printf '  frontend: %s\n' "$FRONT_CONTRACT" >&2
printf '  backend:  %s\n' "$BACK_CONTRACT" >&2
printf 'The two copies of the node inventory disagree, so a document would\n' >&2
printf 'render differently on each side. Deploy both halves together.\n' >&2
diff <(printf '%s' "$back" | tr '\\n' '\n') <(printf '%s' "$front" | tr '\\n' '\n') >&2 || true

if [[ "${ALLOW_SCHEMA_DRIFT:-}" == "1" ]]; then
  # Deliberate, temporary drift — deploying the frontend ahead of a backend
  # change is a real situation. Named so that setting it is a decision, not a
  # reflex.
  printf 'ALLOW_SCHEMA_DRIFT=1 set; continuing despite the mismatch.\n' >&2
  exit 0
fi

exit 1
