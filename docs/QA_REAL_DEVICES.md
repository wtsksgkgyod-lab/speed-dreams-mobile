# Real-device acceptance / evidence template

Do not mark any item "pass" until the genuine engine and assets have compiled and been exercised on actual hardware. Headless Chromium layout checks are not phone tests.

## Verified desktop automation baseline (not physical device QA)

- GitHub Actions [run 43767505631](https://github.com/wtsksgkgyod-lab/speed-dreams-mobile/actions/runs/43767505631), 2026-11-15.
- Original Speed Dreams C/C++ compiled to WASM, native startup/menu rendered under headless Chromium.
- Browser touch-accessible START RACE was clicked to confirm the original `Hit <Enter> or any joystick button to start` prompt.
- Held virtual throttle after the confirmation: speed HUD reached **187 km/h**, up from **0 km/h** in the previous failing run.
- This confirms basic native race entry, speed telemetry and input wiring only. It does NOT verify AI race completion, manual shifting, lap timing, real GPU performance, memory, actual iPhone/Android operation, or a public deployed site.
- CI must block production deployment if the real-WASM engine boot or throttle regression fails.

## iPhone startup-freeze mitigation and diagnosis (2026-11-16)

A tester reported that initiating the game on an iPhone Safari device caused the page to freeze. **The exact point of failure and root cause have NOT yet been proven.** The 84 MiB compressed original `start` asset, 23 MiB compressed `music` pack, per-entry expansion into Emscripten MEMFS, first WebGL initialization and on-demand race content are credible sources of memory pressure.

The mobile WebKit/small-touch budget now:
- Decreases first-render resolution/pixel ratio and its pixel cap (original physics and AI remain unchanged).
- Does not eagerly download/decompress the separate 23 MiB music pack; keeps desktop and explicit `?full=1` legacy path unchanged. The native on-demand `wgDataReady` hook can request music when necessary.
- Prefetches original Brno track pack before enabling the on-screen START RACE button, avoiding a synchronous tap-time download on low-memory devices.
- Persists short startup stages locally so a Safari page reload can report the last stage without exfiltrating data. The new `診断情報をコピー` control creates a report that the player can share manually.
- Adds a required *Chromium* small mobile viewport + touch-emulation genuine WASM smoke to CI, but this **does not** replace iPhone Safari testing.

**If freeze persists:** Ask which screen/button: (1) QUICK RACE launch, (2) loading screen, or (3) START RACE on original pre-race screen. Reload Safari and copy diagnostics. Report whether Safari reloads itself, exits, or stops responding without changing the original simulation. Do not mark P2 complete until repeated Quick Race starts, acceleration, a completed race, and at least 20 min of normal iPhone use are measured.

## Real iPhone critical performance failure (reported 2026-11-16)

The player reports **approximately 0.3 frames/second** on an iPhone when the original Quick Race starts. This is a genuine failure of mobile playability, not a completed phone QA pass. Device-side GPU/CPU timings were not captured, so the bottleneck is not yet proven.

Investigation of the pinned Speed Dreams source found a potentially serious **unbounded simulation catch-up loop** in `ReSituationUpdater::computeCurrentStep`: after a slow WebGL frame, the simulator tries to execute every missed 0.002-second physics step, potentially creating positive feedback between slow graphics and CPU debt. The integration's WASM-only patch now limits catch-up to 0.080s (original simuv5 step size is unchanged), intentionally allowing slow-motion game time under severe load rather than a frozen main thread. Desktop builds and upstream source remain untouched.

Other changes:
- Use a conservative version of the **original** `data/config/graph.xml` on mobile: shorter visibility range, earlier car LOD, no sky dome/clouds, static instead of expensive shadows. This is reversible for A/B checks with `?profile=original`.
- Native C++ counters report time spent updating simulation, rendering original 3D, drawing native GUI, submitting/swapping browser WebGL frames, and wall-time debt discarded.
- A small **PERF** panel during racing allows an opt-in eight-second *no-3D-render* isolation test; 3D draw returns automatically. This is **diagnostic only**, not a gameplay setting. Use the **診断をコピー** button to share the numerical record.
- Emulated Chromium test failures/successes are not evidence of Safari 30/60 FPS. The follow-up physical device report must distinguish whether frame time is concentrated in sim/AI catch-up or PLIB/gl4es/WebGL rendering.

**Hard release gate:** 0.3fps fails. No commercial/playable claims, no further visual polish, until real iPhone tests show at least stable 30 FPS and responsive driving, with original physics and a completed race.

## Compatibility matrix

| Target | Device OS / browser | Boot | Drive | AI | Repeat x5 | FPS median/p1 | JS/Wasm memory | Input delay | Result |
|---|---|---|---|---|---|---|---|---|---|
| iPhone SE 3 | Safari / actual iOS | PASS (starts race) | BEGINS / NOT PLAYABLE | UNTESTED | UNTESTED | **~0.3 FPS reported** | not measured | not measured | **FAIL** |
| iPhone recent | Safari / actual iOS | UNTESTED | UNTESTED | UNTESTED | UNTESTED | not measured | not measured | not measured | UNTESTED |
| Android mid-range | Chrome / actual Android | UNTESTED | UNTESTED | UNTESTED | UNTESTED | not measured | not measured | not measured | UNTESTED |
| Desktop | Chromium / macOS or Windows | UNTESTED | UNTESTED | UNTESTED | UNTESTED | not measured | not measured | not measured | UNTESTED |

## On-device driving test

1. New tab, landscape: capture first-time load sizes, downloads, elapsed time, blank frames and browser errors. Verify all needed original game materials load.
2. Navigate simulator native menus by touch (or explicit separate menu mapping if needed); choose one car/circuit and Quick Race, against a few original AI drivers.
3. Touch down on left steering and right throttle simultaneously. Confirm smooth analog change and matching wheel response; switch to brake while steering; release and verify throttle/brake == 0.
4. With AT, verify gear up/down through Speed Dreams automatic transmission. MT: tap + multiple times, wait for gearbox; brake/downshift; verify no lost or duplicated gear changes.
5. Test ABS/TCS behavior, sand/kerbs, understeer/oversteer, AI car proximity, collision, restart, finishing a race.
6. Repeat 5 races, change car and track, return to menus; background the tab mid-throttle; return; switch orientation, disconnect gamepad if applicable. Check no unintended persistent throttle.
7. Measure actual frame times via remote Safari Web Inspector / Android Chrome trace where available. Never equate screen capture FPS or requestAnimationFrame sampling with GPU render timing.
8. Measure memory under load. Note WASM heap != total memory; include JS buffers, ZIP extraction and GPU textures where supported.
9. Test cold cache vs warm cache; HTTP disconnect of on-demand pack; retry; low-storage/private mode.
10. Confirm original source and content credits; verify reproduction/redistribution rights for each included car/track.

## Release-blocking conditions

- Missing original WASM, missing packs, synthetic replacement physics, or unavailable reliable 1-race completion.
- Pedal remains pressed after pointercancel/lostpointercapture/page hidden.
- Race initialization stalls indefinitely after failed asset download.
- Runtime OOM/crash on normal device or severe input delay.
- Assets/licenses not verified, modified source unavailable to players.
