#!/bin/bash -e
# Create or refresh the GitHub Release asset for Android jniLibs.
# Intended to be run ONLY from your own terminal (gh auth as you).
#
# Prerequisites:
#   - gh installed and authenticated (`gh auth login`)
#   - llama-rn-android-jni-libs.tar.gz present (./scripts/pack-android-jni-libs.sh)
#   - package.json version + repository point at this fork
#   - install/native-artifacts.json android sha256 matches the tarball
#
# Usage:
#   ./scripts/publish-android-release.sh              # create release if missing, upload asset
#   ./scripts/publish-android-release.sh --clobber     # replace existing asset on the tag
#   ./scripts/publish-android-release.sh --notes-file NOTES.md
#
# Prefer the one-shot orchestrator: ./scripts/release-android-jni.sh [--build]
#
# Tag is always: v${package.json version}
# Target commitish: current HEAD (or RELEASE_TARGET env).

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ASSET_NAME="llama-rn-android-jni-libs.tar.gz"
CLOBBER=0
NOTES_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --clobber) CLOBBER=1; shift ;;
    --notes-file) NOTES_FILE="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI not found. Install: brew install gh && gh auth login"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node required"
  exit 1
fi

if [ ! -f "$ASSET_NAME" ]; then
  echo "error: missing $ASSET_NAME — run ./scripts/pack-android-jni-libs.sh first"
  exit 1
fi

# Gate: unit tests for layout rules + live archive validation (no upload yet)
echo "running android jni archive tests..."
npm run test:android-jni-archive

MANIFEST_SHA="$(node -e "const m=require('./install/native-artifacts.json'); const a=m.artifacts.find(x=>x.name==='android-jni-libs'); if(!a||!a.sha256) process.exit(2); console.log(a.sha256)")"
node ./install/validate-android-jni-archive.js --sha256 "$MANIFEST_SHA" "$ASSET_NAME"

eval "$(node <<'NODE'
const fs = require('fs')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const manifest = JSON.parse(fs.readFileSync('install/native-artifacts.json', 'utf8'))
const android = (manifest.artifacts || []).find((a) => a.name === 'android-jni-libs')
const repoRaw = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository && pkg.repository.url) || ''
const repo = repoRaw.replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/$/, '')
if (!pkg.version) {
  console.error('error: package.json missing version')
  process.exit(1)
}
if (!repo.includes('github.com/')) {
  console.error('error: package.json repository must be a github.com URL')
  process.exit(1)
}
if (!android || typeof android.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(android.sha256)) {
  console.error('error: android sha256 not pinned in install/native-artifacts.json')
  process.exit(1)
}
const crypto = require('crypto')
const actual = crypto.createHash('sha256').update(fs.readFileSync('llama-rn-android-jni-libs.tar.gz')).digest('hex')
if (actual !== android.sha256.toLowerCase()) {
  console.error(`error: tarball sha256 mismatch\n  manifest: ${android.sha256}\n  file:     ${actual}\nrun ./scripts/pack-android-jni-libs.sh`)
  process.exit(1)
}
const ownerRepo = repo.replace(/^https?:\/\/github\.com\//, '')
console.log(`VERSION=${JSON.stringify(pkg.version)}`)
console.log(`TAG=${JSON.stringify('v' + pkg.version)}`)
console.log(`OWNER_REPO=${JSON.stringify(ownerRepo)}`)
console.log(`SHA256=${JSON.stringify(android.sha256)}`)
NODE
)"

TARGET="${RELEASE_TARGET:-HEAD}"
TITLE="Android JNI libs (TurboQuant) ${VERSION}"

if [ -n "$NOTES_FILE" ]; then
  NOTES="$(cat "$NOTES_FILE")"
else
  NOTES="$(cat <<EOF
TurboQuant Android prebuilts for this llama.rn fork.

- version / tag: \`${VERSION}\` / \`${TAG}\`
- asset: \`${ASSET_NAME}\`
- sha256: \`${SHA256}\`
- layout: \`android/src/main/jniLibs/{arm64-v8a,x86_64}/\`

Published via \`./scripts/release-android-jni.sh\` / \`publish-android-release.sh\` (operator terminal).
EOF
)"
fi

echo "repo:   $OWNER_REPO"
echo "tag:    $TAG"
echo "target: $TARGET"
echo "asset:  $ASSET_NAME"
echo "sha256: $SHA256"
echo ""

if gh release view "$TAG" -R "$OWNER_REPO" >/dev/null 2>&1; then
  echo "release $TAG already exists — refreshing notes + uploading asset"
  gh release edit "$TAG" -R "$OWNER_REPO" --title "$TITLE" --notes "$NOTES"
else
  echo "creating release $TAG"
  gh release create "$TAG" \
    -R "$OWNER_REPO" \
    --target "$TARGET" \
    --title "$TITLE" \
    --notes "$NOTES"
fi

UPLOAD_ARGS=(-R "$OWNER_REPO")
if [ "$CLOBBER" = "1" ]; then
  UPLOAD_ARGS+=(--clobber)
fi

gh release upload "$TAG" "$ASSET_NAME" "${UPLOAD_ARGS[@]}"

echo ""
echo "done: https://github.com/${OWNER_REPO}/releases/tag/${TAG}"
echo "verify download URL:"
echo "  https://github.com/${OWNER_REPO}/releases/download/${TAG}/${ASSET_NAME}"
echo ""
echo "then commit package.json + install/native-artifacts.json on the fork if not already pushed."
