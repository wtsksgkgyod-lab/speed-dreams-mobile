# Continuation command for ChatGPT Work or a remote build agent

This folder contains an implemented mobile integration (not just a brief). **Preserve and extend it, do not start over.**

1. Extract `SPEED_DREAMS_MOBILE_IMPLEMENTATION_v0.1.0.zip` completely and read `README.md`, `docs/RELEASE_LIMITATIONS.md`, `native/mobile_bridge.inc` and `scripts/build_mobile.sh`.
2. Obtain a **real** network-enabled Linux Emscripten SDK 4.0.7 environment. Clone wasmga.me Speed Dreams fork SHA `87fd141f92450405d795b15d91c276a6faf0882d`; its own original engine SHA is `4e29a83bb701f47ade617a9d73e20e736c492e82`.
3. Execute `bash scripts/build_mobile.sh` and fix errors in current source code, not by inserting a fake racing demo. Preserve original `simuv5` and AI modules.
4. Load emitted `web/` in actual desktop browser. Test loading original start/music ZIPs, original menu navigation, live track/car pack downloads, native touch C ABI, auto/manual gears and sustained Quick Race against Simplix AI.
5. If necessary change patch points, especially `rthumandriver.cpp`, while preserving ABS, ASR, clutch and drivetrain logic. Add reproducible tests for fixes.
6. Perform physical iPhone Safari and Android Chrome tests, record objective FPS, memory and latency. Iterate until reliable at least 30 fps on supported phones; 60 fps is stretch goal.
7. Audit licenses and supply complete corresponding source and attribution notices; do not submit AI content upstream. Deploy only a proven genuine racing build, to ChatGPT Sites if it can serve static WASM+assets or another appropriate static host.
8. Report exact working URL, source SHA, timings, completed QA, and unresolved defects without claiming unseen tests passed.
