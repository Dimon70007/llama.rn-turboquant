#!/bin/bash -e
# Pack android/src/main/jniLibs into llama-rn-android-jni-libs.tar.gz with the
# path layout expected by install/download-native-artifacts.js, then pin sha256
# in install/native-artifacts.json.
#
# Usage (from package root):
#   ./scripts/pack-android-jni-libs.sh
#   ./scripts/pack-android-jni-libs.sh --build   # run build-android.sh first
#
# Does NOT upload to GitHub. For that, run ./scripts/publish-android-release.sh yourself.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ASSET_NAME="llama-rn-android-jni-libs.tar.gz"
JNI_REL="android/src/main/jniLibs"

if [ "${1:-}" = "--build" ]; then
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
  ./scripts/build-android.sh
fi

if [ ! -d "$JNI_REL" ]; then
  echo "error: missing $JNI_REL"
  echo "hint: run ./scripts/build-android.sh or pass --build"
  exit 1
fi

# Sanity: at least one arm64 core lib
if ! ls "$JNI_REL"/arm64-v8a/librnllama*.so >/dev/null 2>&1; then
  echo "error: no librnllama*.so under $JNI_REL/arm64-v8a"
  exit 1
fi

# Correct layout: entries must be android/src/main/jniLibs/... (not top-level jniLibs/)
rm -f "$ASSET_NAME"
tar czf "$ASSET_NAME" -C . "$JNI_REL"

echo "packed: $ROOT_DIR/$ASSET_NAME"
tar tzf "$ASSET_NAME" | head -12
echo "..."

node ./install/validate-android-jni-archive.js "$ASSET_NAME"

node ./install/write-native-artifacts-manifest.js

SHA="$(node -e "const m=require('./install/native-artifacts.json'); console.log(m.artifacts.find(a=>a.name==='android-jni-libs').sha256)")"

# Re-validate against pinned manifest sha (catches write-native-artifacts mistakes)
node ./install/validate-android-jni-archive.js --sha256 "$SHA" "$ASSET_NAME"

echo ""
echo "android sha256: $SHA"
echo "next (your terminal only): npm run test:android-jni-archive && ./scripts/publish-android-release.sh"
