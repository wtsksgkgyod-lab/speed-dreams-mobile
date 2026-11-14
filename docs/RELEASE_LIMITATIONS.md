# Execution record (2026-11-14)

## Completed in current turn

- Read previous v1.0 engineering reference files.
- Inspected authentic wasmga.me `wasmgame/build.sh`, `speeddreams.diff`, `pack.py` and original `rthumandriver.cpp`, `main.cpp` via GitHub API read connector.
- Source-fork commit pinned to `87fd141f92450405d795b15d91c276a6faf0882d`; upstream revision remains `4e29a83bb701f47ade617a9d73e20e736c492e82`.
- Implemented native inputs in C++ with sample-frame pulse queue, analog controls and a touch-only manual/automatic mode bridge; original simuv5 physics and AI untouched.
- Built standalone Emscripten host and actual ZIP pack installer, provided CI/rebuild scripts and release-integrity validation.
- Node tests passed; patch-application fixture test passed; C++ bridge compiled against stubbed game fields and ran assertions; static CSS/HTML visually rendered in Chromium at two viewports.

## Exactly what is blocked

1. `git ls-remote https://github.com/wasmga-me/speed-dreams-wasm.git` in local container: `Could not resolve host: github.com`. GitHub read connector can inspect source text but does not provide a locally materialized full repository or original game content.
2. `command -v emcc`: no Emscripten compiler installed; without internet we cannot install SDK 4.0.7 / original dependencies.
3. AppDeploy's deploy-instructions call returned `CREDITS_USAGE_LIMIT_REACHED`; daily new-deployment limit will reset at 2026-11-15 00:00 UTC (per provider's explicit response). Do not repeatedly retry before reset.
4. Vercel list-projects API returned HTTP 403 (team authorization missing), so sandbox/remote build access not authorized.
5. Chromium's attempted `http://127.0.0.1` navigation was blocked with `ERR_BLOCKED_BY_ADMINISTRATOR`; static `set_content` layout tests worked but are **not** running the loader/engine.
6. No physical phone and no WASM binary or game packs present. **No genuine race, AI, shifting, brakes, iPhone Safari, Android Chrome, 30/60fps, memory, or input lag measured.**

## Non-completed features / risks

- Build integration may surface actual Emscripten/C++ linking errors. This artifact is not engine-compiled.
- Native SDL menus may need touch event adaptation. Browser canvas receives events but full native menu interaction is unverified.
- Rendering adjustments/quality are provisional, not driven by real profiling. Screen RAF FPS is a proxy, not simulation or GPU timing.
- Sound/asset pack loading, persisted settings and WebGL context recovery are incomplete/untested.
- UI footer notices are a legal starting point, not final proof of per-asset redistribution rights.
- `web/game/`, `web/data/`, `web/vendor/` intentionally contain no original runtime/assets; the honest boot error states that a build is required.

## Continuation instructions

Upload this complete folder to a network-capable Ubuntu worker / GitHub repository and run `bash scripts/build_mobile.sh` with emsdk 4.0.7 activated. Fix any build or game integration errors, then execute `docs/QA_REAL_DEVICES.md` including physical iPhone and Android tests. Publish a version only when release gates pass, with corresponding sources and license notices.
