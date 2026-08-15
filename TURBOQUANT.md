# TurboQuant vendor notes

- Nested llama.cpp SoT: `third_party/llama.cpp` → `https://github.com/AtomicBot-ai/atomic-llama-cpp-turboquant` branch `feature/turboquant-kv-cache` (aligned with `linux_to_mac` F2 lock).
- Current lab pin: `519f0c594a8e31467d2e2f2cf17054c9e7e11536` (2026-07-03; includes `LLM_ARCH_GEMMA4`).
- Legacy remote kept as `atomicmilkshake` (pre-gemma4 pin `8ad0f00e`, 2026-03-31).
- Sync into `cpp/` via `npm run bootstrap` (patched for optional missing upstream files + `ggml-turbo-quant.c`).
- JS allowlist: `cache_type_k/v` accepts `turbo2|turbo3|turbo4` (`src/index.ts`).
- Native map: `cpp/rn-llama.cpp` `kv_cache_types` includes `LM_GGML_TYPE_TURBO{2,3,4}_0`.
- Android CMake: optional `ggml-turbo-quant.c` / `ggml-backend-meta.cpp`.

Recommended product KV: `cache_type_k: 'q8_0'`, `cache_type_v: 'turbo3'` (asymmetric).

Android prebuilt Release (pack + publish from **your** terminal only): see [`docs/PUBLISH-ANDROID-RELEASE.md`](docs/PUBLISH-ANDROID-RELEASE.md).

**Layout rule:** archive entries must be `android/src/main/jniLibs/...` — never top-level `jniLibs/`. Pack/publish scripts validate this; Jest: `npm run test:android-jni-archive`.

```bash
./scripts/pack-android-jni-libs.sh --build   # pack + validate + pin sha256
npm run test:android-jni-archive             # layout regression (also gated in publish)
./scripts/publish-android-release.sh --clobber   # gh, operator only — refuses bad layout/sha
```
