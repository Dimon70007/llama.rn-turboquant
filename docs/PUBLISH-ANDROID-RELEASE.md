# Publish Android JNI release (this fork)

How to publish prebuilt Android native libs as a **GitHub Release** on this fork.

**Releases are published only from your own terminal** — no CI/agent auto-upload.

Forks can publish Releases (not limited to upstream `mybigday/llama.rn`).

## One-liner flow (operator)

```bash
cd vendor/llama.rn-turboquant   # or this package root

# 1) Build core .so + pack + validate layout/sha + pin manifest
./scripts/pack-android-jni-libs.sh --build

# 2) Jest layout regression tests (also runs inside publish script)
npm run test:android-jni-archive

# 3) You: create/update GitHub Release + upload (requires `gh auth login`)
#    publish script re-runs tests + validate before any gh upload
./scripts/publish-android-release.sh --clobber

# 4) Commit & push package.json version/repo + install/native-artifacts.json (+ scripts/docs/tests)
git add package.json install/native-artifacts.json docs/PUBLISH-ANDROID-RELEASE.md \
  install/validate-android-jni-archive.js install/__tests__/validate-android-jni-archive.test.js \
  scripts/pack-android-jni-libs.sh scripts/publish-android-release.sh
git commit -m "chore: pin Android jniLibs release artifacts"
git push
```

## Layout gate (mandatory)

`install/download-native-artifacts.js` extracts the tarball at the **package root**. Paths inside the archive must therefore be:

```text
android/src/main/jniLibs/<abi>/librnllama*.so
```

### Classic footgun

| Pack command | Tar entries | Result after postinstall |
|--------------|-------------|---------------------------|
| ❌ `tar czf … -C android/src/main jniLibs` | `jniLibs/arm64-v8a/…` | libs land at package-root `jniLibs/` — **wrong**; Gradle never sees them |
| ✅ `tar czf … -C . android/src/main/jniLibs` | `android/src/main/jniLibs/…` | libs land where CMake/Gradle expect |

Always use [`scripts/pack-android-jni-libs.sh`](../scripts/pack-android-jni-libs.sh) — do not hand-roll `tar` for releases.

### What the validator enforces

[`install/validate-android-jni-archive.js`](../install/validate-android-jni-archive.js):

1. Rejects top-level `jniLibs/` (and any entry outside `android/src/main/jniLibs/`, except parent dirs `android`, `android/src`, `android/src/main`).
2. Requires at least one arm64 core lib (`librnllama.so` or `librnllama*.so` under `arm64-v8a/`).
3. Optionally checks `--sha256` against the file (used after manifest pin and before upload).

### Where the gate runs

| Check | Where |
|-------|--------|
| Shared validator (CLI + module) | `install/validate-android-jni-archive.js` |
| Jest regressions | `install/__tests__/validate-android-jni-archive.test.js` — good layout / bad `jniLibs/` / missing `.so` / sha mismatch / missing file |
| After pack + after manifest pin | `pack-android-jni-libs.sh` |
| **Before** any `gh release upload` | `publish-android-release.sh` runs `npm run test:android-jni-archive` + validator with manifest sha |

```bash
npm run test:android-jni-archive
node install/validate-android-jni-archive.js llama-rn-android-jni-libs.tar.gz
node install/validate-android-jni-archive.js --sha256 <hex> llama-rn-android-jni-libs.tar.gz
```

If tests or validate fail, **do not** upload. Fix the pack and re-run `./scripts/pack-android-jni-libs.sh`.

## Scripts

| Script | What it does | Uploads to GitHub? |
|--------|----------------|--------------------|
| [`scripts/pack-android-jni-libs.sh`](../scripts/pack-android-jni-libs.sh) | Optional `--build`, packs archive, validates, pins sha256 | **No** |
| [`scripts/publish-android-release.sh`](../scripts/publish-android-release.sh) | Tests + validate, then `gh release create/upload` | **Yes — only when you run it** |

npm aliases:

```bash
npm run pack:android-jni
npm run test:android-jni-archive
npm run publish:android-release -- --clobber
```

## What gets published

| Item | Notes |
|------|--------|
| Asset name | **`llama-rn-android-jni-libs.tar.gz`** (`install/native-artifacts.json` → `assetName`) |
| Tar layout | Must be `android/src/main/jniLibs/...` (same as upstream). Top-level `jniLibs/` breaks postinstall |
| Contents | Core `librnllama*.so` for `arm64-v8a` / `x86_64` |
| Not in tarball | `librnllama_jni*.so` — built by the app CMake (React Native / fbjni) |
| TurboQuant | Required in the `.so` (e.g. `quantize_turbo4_0`) |

## Tag ↔ package.json

`install/download-native-artifacts.js` downloads from:

```text
https://github.com/<owner>/<repo>/releases/download/v<package.json version>/<assetName>
```

So:

| Field | Must be |
|-------|---------|
| `package.json` `"version"` | e.g. `0.12.6-turboquant.1` |
| GitHub tag | `v` + version → `v0.12.6-turboquant.1` |
| `package.json` `"repository"` | `https://github.com/Dimon70007/llama.rn-turboquant` |

`publish-android-release.sh` derives tag/repo from `package.json` and refuses to upload if the tarball sha ≠ manifest.

Downloader installs **only** artifacts with a non-null `sha256`. iOS may stay `null` while Android is pinned.

## Consumer wiring (app)

1. Manifest: android `sha256` pinned; iOS may stay `null`.
2. App `android/gradle.properties`: `rnllamaBuildFromSource=false` to link prebuilt core libs (JNI still builds in-app).
3. After clone/install: `npm install` or `npm run download:native-artifacts` (from package root / app postinstall).

## Verify after you publish

```bash
# From package root — should fetch into android/src/main/jniLibs
rm -rf android/src/main/jniLibs
node ./install/download-native-artifacts.js --force
ls android/src/main/jniLibs/arm64-v8a/
# expect librnllama*.so (not an empty or wrong-path tree)
```

If download succeeds but paths are wrong, the Release asset still has a bad layout — re-pack with `pack-android-jni-libs.sh`, re-run tests, then `publish-android-release.sh --clobber`.

## Related

| Script / doc | Role |
|--------------|------|
| `npm run bootstrap` | Sync `third_party/llama.cpp` → `cpp/` (+ TQ) |
| `./scripts/build-android.sh` | Build core `.so` into `jniLibs` |
| `node install/download-native-artifacts.js` | Fetch Release assets by sha256 |
| `node install/write-native-artifacts-manifest.js` | Fill sha256 from local archives (skips missing) |
| [`TURBOQUANT.md`](../TURBOQUANT.md) | Fork pin / KV defaults / pointer here |
