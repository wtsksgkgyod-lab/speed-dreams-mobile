# Real-device acceptance / evidence template

Do not mark any item "pass" until the genuine engine and assets have compiled and been exercised on actual hardware. Headless Chromium layout checks are not phone tests.

## Verified desktop automation baseline (not physical device QA)

- GitHub Actions [run 43767505631](https://github.com/wtsksgkgyod-lab/speed-dreams-mobile/actions/runs/43767505631), 2026-11-15.
- Original Speed Dreams C/C++ compiled to WASM, native startup/menu rendered under headless Chromium.
- Browser touch-accessible START RACE was clicked to confirm the original `Hit <Enter> or any joystick button to start` prompt.
- Held virtual throttle after the confirmation: speed HUD reached **187 km/h**, up from **0 km/h** in the previous failing run.
- This confirms basic native race entry, speed telemetry and input wiring only. It does NOT verify AI race completion, manual shifting, lap timing, real GPU performance, memory, actual iPhone/Android operation, or a public deployed site.
- CI must block production deployment if the real-WASM engine boot or throttle regression fails.

## Compatibility matrix

| Target | Device OS / browser | Boot | Drive | AI | Repeat x5 | FPS median/p1 | JS/Wasm memory | Input delay | Result |
|---|---|---|---|---|---|---|---|---|---|
| iPhone SE 3 | Safari / actual iOS | UNTESTED | UNTESTED | UNTESTED | UNTESTED | not measured | not measured | not measured | UNTESTED |
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
