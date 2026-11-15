# SPEED DREAMS MOBILE | GitHub-ready integration v0.2.0

An **unofficial independent mobile browser derivative** of **Speed Dreams**, using the EXISTING [wasmga.me Emscripten/WebAssembly port](https://github.com/wasmga-me/speed-dreams-wasm) and the actual original game simulation/AI. Not a Three.js remake or demo game.

## Verification status (2026-11-15)

**Genuine Speed Dreams WebAssembly compilation and headless Chromium engine boot are verified. Mobile driving and public deployment are NOT yet verified.**

GitHub Actions compiles the original Speed Dreams C/C++ game and its original cars/tracks. Run [#13](https://github.com/wtsksgkgyod-lab/speed-dreams-mobile/actions/runs/43655181344) succeeded in the *build job* and its real-WASM browser boot smoke test. Its full workflow conclusion remains failure because GitHub Pages deployment returns 404 while the repository has no enabled Pages site. Original physical racing, manual shifting, iPhone FPS, Android performance and repeated sessions remain **UNTESTED**. Direct Quick Race acceleration is being evaluated separately in [run #14](https://github.com/wtsksgkgyod-lab/speed-dreams-mobile/actions/runs/43655954301). Do not present this as a verified playable release.

### Mobile optimization pass

- Original physics/AI are unchanged. JavaScript->WASM input snapshots now transmit only when control values change, avoiding the formerly continuous RAF push.
- Fewer mobile rendering pixels at startup; conservative downscale governor, no auto upscale on misleading page RAF statistics. HIGH remains manual.
- ZIP installation caches already-created Emscripten FS directories and yields by file count and elapsed work time.
- At most one original car/track ZIP download is in-flight on small touch devices, two on larger browsers.
- `?debug=1` reports page RAF proxy timing and per-pack download/hash/extract durations (not direct GPU timing).
- The separate fast GitHub Actions check passed **18 JavaScript tests**, the C++ bridge stub contract and the source patch test. A 1,000-entry simulated ZIP needed one directory-creation operation. See [optimization measurements and limits](docs/MOBILE_OPTIMIZATION_AUDIT.md).

| Area | Confirmed result |
|:--|:--|
| Original source + WebAssembly | Built successfully in GitHub Actions |
| Generated runtime + original data packs | 16 integrity-checked asset packs produced |
| Optimized C++/JavaScript source tests | 18/18 Node tests plus bridge fixture and syntax checks passed |
| Actual desktop headless Chromium engine boot | Passed on optimized build #13 |
| Native Quick Race throttle/AI/lap | Separate test in progress; not yet confirmed |
| Physical iPhone/Android stable 30fps, memory, latency | Not measured |
| Public playable URL | None; GitHub Pages API responds 404 and repository is not Pages-enabled |

## Reproducible compilation

Prerequisites: Linux x86_64 worker with **network access**, at least 8 GiB RAM recommended, significant disk, Git, CMake, make, Python 3, Node 22+/npm, **Emscripten SDK 4.0.7**. The original port downloads a full upstream simulator, 6 cars, 6 tracks and multiple third-party libraries; build can be long or require upstream fixes. The Web fork is pinned to `87fd141f92450405d795b15d91c276a6faf0882d`. The upstream Speed Dreams engine is pinned by `wasmgame/build.sh` to `4e29a83bb701f47ade617a9d73e20e736c492e82`.

```bash
# On network-enabled Linux; inside THIS extracted source directory.
git clone --depth 1 https://github.com/emscripten-core/emsdk.git /tmp/emsdk
/tmp/emsdk/emsdk install 4.0.7
/tmp/emsdk/emsdk activate 4.0.7
source /tmp/emsdk/emsdk_env.sh
JOBS=2 bash scripts/build_mobile.sh

# After successful build and release-integrity check:
python3 -m http.server 8080 -d web
# Open http://localhost:8080 in desktop Chrome, then test on an actual phone.
```

Alternatively put this entire directory in a user-controlled GitHub repository with Actions enabled, and trigger `.github/workflows/build.yml`. The workflow runs source tests, downloads the pinned Emscripten toolchain, compiles the **genuine** Speed Dreams WASM engine, and uploads the resulting `speed-dreams-mobile-dist` artifact with original WASM/game assets and corresponding source archives. When the repository is **public** and GitHub Pages source is set to **GitHub Actions**, it also attempts to deploy the same compiled distribution directly to GitHub Pages. If the compiled site exceeds 1 GB, it skips Pages and retains the downloadable build artifact. No compiled runtime is included in this repository until Actions succeeds. Hosting must serve `.wasm` as `application/wasm`, use HTTPS for iPhone Safari, and use matching asset paths.

### Publish on GitHub Free

1. Create a **new public** repository named `speed-dreams-mobile` (do not add a README/license/gitignore; this package already includes them). No need for GitHub Pro.
2. Upload **all files in this project, including the hidden `.github/workflows/build.yml` path**, on its `main` branch. Using a computer with Git is recommended because GitHub's browser upload may not preserve hidden folders reliably.
3. In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source, then open **Actions** and run *Build and publish Speed Dreams Mobile* (or push a source change).
4. Only when the workflow finishes with successful `build` and `deploy` jobs, open the Pages URL shown in the deploy job. Even then, treat it as **untested driving** until original car controls and race completion are verified on a real phone.

**Note:** This connected assistant's current GitHub tool does not offer the create-repository or Pages-settings API. The ZIP is upload-ready but is not proof that GitHub Actions completed or the game is playable.

The bundled source intentionally does **not** include generated `speeddreams.wasm`, the original game data, the npm `fflate` UMD dependency, or a fabricated replacement runtime.

## Drive and test

1. Tap **ENGINE START**. The host loads the genuine Emscripten module, integrity-checks/installs original `start` and `music` packs and invokes Speed Dreams' native main entry.
2. Navigate the **original simulator menus** on the canvas. Touch menu compatibility requires integration testing.
3. Enter a Quick Race or Practice using original menu modes. Tap **TOUCH ON** when driving. Tap **TOUCH OFF** before using menus.
4. On the left, slide sideways in steering area. On the right, slide vertically on accelerator and brake. Change AT/MT from the top toolbar; MT has +/- sequential buttons. The native driver retains ABS/TCS, auto-clutch and original physics.
5. Debug stats: append `?debug=1` to the URL. Browser RAF FPS is **not** a GPU profiler or proof of physical driving performance.
6. Run **repeated races**, not only main-menu smoke. See `docs/QA_REAL_DEVICES.md`.

## Technical design and implementation

- `native/mobile_bridge.inc`: C ABI exported via `EMSCRIPTEN_KEEPALIVE`, normalized analog axes, latched gear pulse counters, simple telemetry. Overrides original human control values **before** original clutch, ABS and ASR processing, without touching `simuv5` or other robot drivers.
- `scripts/apply_native.py`: carefully anchored modifications to original `src/libs/robottools/rthumandriver.cpp`; fails closed if the pinned upstream changes.
- `scripts/inject_build.py`: integrates native patch in original wasmga.me build immediately after its existing browser patch.
- `web/mobile.mjs`, `core.mjs`, `mobile.css`, `index.html`: responsive landscape-first interface, pointer IDs, lost-focus resets, device rotation, runtime loading, switchable desktop/native controls.
- `web/zip.mjs`, `packs.mjs`: on-demand pack retrieval and per-entry decompression into original Emscripten `FS`, SHA-256 integrity, path traversal and CRC validation. The original web port's `Module.wgDataReady` hook is kept.
- `scripts/create_manifest.py`: hashes actual built ZIP files; generated `web/app-manifest.json` contains URL + SHA for every pack.
- `scripts/verify_release.py`: refuses a package with missing WASM/assets/source files. It does NOT certify gameplay quality.

## Tests in this environment

```bash
npm test
python3 tests/native_patch_test.py
clang++ -std=c++17 -Wall -Wextra -Werror \
  -Itests/fake-emscripten tests/native_bridge_compile.cpp -o /tmp/sd_bridge_test
/tmp/sd_bridge_test
python3 tests/browser_smoke.py  # static UI/CSS only, not live app
```

## Mandatory release gates

- Actual successful complete Speed Dreams compilation using `scripts/build_mobile.sh`, with native C++ bridge symbols present.
- Native menus navigate, player car moves/steers/brakes/changes gears, original AI competes and one race finishes.
- Verify iPhone Safari and Android Chrome separately on physical phones. Track stable FPS, WebAssembly/JS/GPU memory when available, touch latency and 20-minute repeated sessions. Do not claim 30/60 FPS without measurements.
- Confirm correct music/asset pack loading, recoverable failed downloads, and no stuck accelerator on multitouch release / orientation change / backgrounding.
- Asset-by-asset license review, credit original Speed Dreams and wasmga.me fork, distribute corresponding source and all required GPL/FAL/LGPL/MIT notices. The official Speed Dreams project has a **no AI-generated contributions** policy, so DO NOT send this code as an upstream PR.

## Licensing

Original game code: GPL-2.0-or-later. Original art: generally Free Art License 1.3 except where a directory-specific notice states otherwise. PLIB: LGPL-2.0-or-later; gl4es: MIT; fflate: MIT. Mobile integration source: GPL-2.0-or-later. Verify all files before public redistribution. This is an unofficial project, unrelated to and not endorsed by upstream.

Build copies **corresponding source archives** into `web/source/` alongside the generated WASM and game assets. Consult `web/notices.html` and `docs/RELEASE_LIMITATIONS.md`.
