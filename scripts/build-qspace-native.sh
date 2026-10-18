#!/usr/bin/env bash
# Builds the Q Space storage node (Rust, qspace-agent/crates/qspace-ffi) and
# puts its outputs where android/app/build.gradle looks for them:
#
#   android/app/src/qspaceGenerated/jniLibs/<abi>/libqspace_ffi.so
#   android/app/src/qspaceGenerated/java/uniffi/qspace_ffi/qspace_ffi.kt
#
# The directory is in .gitignore. Without it the app still builds, only
# without the storage node (QSpaceAgent.isAvailable() returns false).
#
# Usage:
#   QSPACE_AGENT_DIR=/path/to/qspace-agent scripts/build-qspace-native.sh [--prebuilt]
#
#   QSPACE_AGENT_DIR  checkout of Qzarov/qspace-agent (default: ../qspace-agent
#                     next to this repository).
#   --prebuilt        do not run cargo; copy what qspace-agent/scripts/build-android.sh
#                     already produced in its target/ directory.
#
# Building needs: rustup targets aarch64-linux-android and x86_64-linux-android,
# cargo-ndk, and ANDROID_NDK_HOME (NDK r28+, for 16 KB page alignment).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="${QSPACE_AGENT_DIR:-${REPO_ROOT}/../qspace-agent}"
OUT_DIR="${REPO_ROOT}/android/app/src/qspaceGenerated"
PREBUILT=0

for arg in "$@"; do
  case "$arg" in
    --prebuilt) PREBUILT=1 ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [ ! -f "${AGENT_DIR}/crates/qspace-ffi/Cargo.toml" ]; then
  echo "qspace-agent not found at ${AGENT_DIR} (set QSPACE_AGENT_DIR)." >&2
  exit 1
fi
AGENT_DIR="$(cd "${AGENT_DIR}" && pwd)"

if [ "$PREBUILT" -eq 0 ]; then
  # Builds both ABIs with the release-android profile (stripped, panic=unwind)
  # and generates the Kotlin bindings from the unstripped host library: the
  # stripped .so has no UniFFI metadata left to read.
  bash "${AGENT_DIR}/scripts/build-android.sh"
fi

TARGET_DIR="${CARGO_TARGET_DIR:-${AGENT_DIR}/target}"
BINDINGS="${TARGET_DIR}/kotlin-bindings/uniffi/qspace_ffi/qspace_ffi.kt"
declare -A TRIPLES=([arm64-v8a]=aarch64-linux-android [x86_64]=x86_64-linux-android)

if [ ! -f "$BINDINGS" ]; then
  echo "Kotlin bindings not found: ${BINDINGS}" >&2
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "${OUT_DIR}/java/uniffi/qspace_ffi"
cp "$BINDINGS" "${OUT_DIR}/java/uniffi/qspace_ffi/"

for abi in "${!TRIPLES[@]}"; do
  so="${TARGET_DIR}/${TRIPLES[$abi]}/release-android/libqspace_ffi.so"
  if [ ! -f "$so" ]; then
    echo "Native library not found for ${abi}: ${so}" >&2
    exit 1
  fi
  mkdir -p "${OUT_DIR}/jniLibs/${abi}"
  cp "$so" "${OUT_DIR}/jniLibs/${abi}/"
done

{
  echo "qspace-agent: $(git -C "$AGENT_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "${OUT_DIR}/SOURCE"

echo "Q Space native part ready in ${OUT_DIR}:"
find "$OUT_DIR" -type f -printf '  %P (%s bytes)\n' | sort
