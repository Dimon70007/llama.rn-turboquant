#!/bin/bash -e
# One-shot Android JNI release (operator terminal only).
#   pack (+ optional build) → publish (tests + validate + gh upload)
#
# Usage (from package root):
#   ./scripts/release-android-jni.sh              # pack existing jniLibs, clobber upload
#   ./scripts/release-android-jni.sh --build      # build .so then pack + publish
#   ./scripts/release-android-jni.sh --no-clobber # create/upload without replacing asset
#   ./scripts/release-android-jni.sh --notes-file NOTES.md
#
# Does NOT run from CI/agents by design — you must invoke it yourself.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BUILD=0
CLOBBER=1
NOTES_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --build) BUILD=1; shift ;;
    --clobber) CLOBBER=1; shift ;;
    --no-clobber) CLOBBER=0; shift ;;
    --notes-file) NOTES_FILE="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      echo "usage: $0 [--build] [--clobber|--no-clobber] [--notes-file FILE]" >&2
      exit 1
      ;;
  esac
done

PACK_ARGS=()
if [ "$BUILD" = "1" ]; then
  PACK_ARGS+=(--build)
fi

echo "==> pack android jni libs"
./scripts/pack-android-jni-libs.sh "${PACK_ARGS[@]}"

PUBLISH_ARGS=()
if [ "$CLOBBER" = "1" ]; then
  PUBLISH_ARGS+=(--clobber)
fi
if [ -n "$NOTES_FILE" ]; then
  PUBLISH_ARGS+=(--notes-file "$NOTES_FILE")
fi

echo ""
echo "==> publish android release"
./scripts/publish-android-release.sh "${PUBLISH_ARGS[@]}"
