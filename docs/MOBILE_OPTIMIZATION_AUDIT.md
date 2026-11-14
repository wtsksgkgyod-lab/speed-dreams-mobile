# Mobile runtime optimization audit — 2026-11-15

Source branch: `perf/mobile-runtime-budget-v1`. Scope: browser UI, asset installation, mobile memory and control transfer. **Original Speed Dreams car simulation, AI and physics are unchanged.**

## Verified improvements in deterministic CI tests

- The native control bridge now receives a 6-value snapshot only when the state changes. A unit test sends the same snapshot 121 times and verifies only the first call reaches the bridge; a changed value and forced safety update are sent normally. This measures JavaScript transfer counts, **not** measured end-to-end input latency.
- Original-style ZIP fixture with 1,000 files in one directory: Emscripten FS `mkdirTree` wrapper invoked **once**, instead of once per file. This is a source-level and fake-FS test, not an actual iPhone result.
- Cooperative ZIP installation yields after either 24 entries or about 8ms of JS processing. Individual synchronous decompression/CRC tasks can still exceed the budget.
- Car/track downloads are queued at one concurrent pack on a small touch screen, two elsewhere. A test with four simulated downloads verifies concurrency remains at one.
- For a 667×375 CSS landscape viewport at DPR 2: previous AUTO drawing dimensions ≈ 964×542; new AUTO ≈ 806×453, roughly **30% fewer drawing pixels**. This is a calculated render-pixel workload proxy; does not imply 30% faster GPU or FPS.
- Dynamic resolution decreases only after six consecutive low-RAF windows, with 9s minimum between changes. It does **not** increase automatically from high page RAF because RAF may not represent game rendering throughput; explicit HIGH remains available.
- On-screen diagnostics include page RAF mean/p95, WASM heap where exposed, C++ input transfer counts and measured per-pack fetch / hash / install durations.

## CI evidence

- GitHub Actions `Fast mobile runtime checks`: 18 JavaScript tests passed, bridge stub compile passed, source patch test passed, and JS syntax checks passed.
- One simulated fixture of 1,000 ZIP entries completed in roughly **5.7ms** in the last observed GitHub Actions run; this is fake MEMFS and tiny fixtures. Timing is environment-specific, not a speedup figure versus original, and **not** measured on real game content.

## Remaining blockers

- Physical iPhone Safari and Android Chrome FPS, total process memory, load time, audio, driving, AI behavior, and repeated races are not yet verified.
- The original `start` data pack remains about 88MB; music is about 24MB. Both were measured from a previous **real WASM compile**, not generated in this optimization test. Full-game first-run network and memory cost are still significant.
- The compiler build has succeeded in earlier GitHub Actions. Browser execution / Quick Race and Pages deployment remain under separate validation. GitHub repo `has_pages=false` during investigation; this cannot be fixed by runtime optimization alone.
- This is not a claim of a finished playable game. Never treat simulated Node benchmarks or headless Chromium as physical-phone QA.

## Next data to collect on real phones

Record cold/warm load timings, on-demand pack timings, Safari memory pressure or tab reloads, stable race FPS with GPU tools, analog control responsiveness, MT shift semantics, and a five-race endurance loop. Use `?debug=1` and `docs/QA_REAL_DEVICES.md`. Do not infer GPU FPS from page RAF.
