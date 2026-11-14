# Speed Dreams Mobile

**Unofficial independent Speed Dreams WebAssembly mobile port.**

Status: source integration and tests have been prepared; **the original game has NOT yet completed the Emscripten build or a verified drive.** Never confuse the mobile control shell with a playable simulator.

This repository preserves the v0.2.0 source in `bundle/sd-mobile-src.tar.gz`, and the GitHub Actions build unpacks it to compile the real [wasmga.me Speed Dreams WebAssembly port](https://github.com/wasmga-me/speed-dreams-wasm) using Emscripten 4.0.7.

## What to do

1. Open **Actions** and inspect **Build and publish Speed Dreams Mobile**.
2. Set **Settings → Pages → Source → GitHub Actions** if GitHub Pages is not active.
3. Only trust a browser URL after the workflow compiles, deploys and a real race can be driven.
4. Read the corresponding source and licensing information distributed with a successful build.

Built from genuine Speed Dreams code (GPL-2.0-or-later; artwork licenses vary). Keep attribution and corresponding source distribution; not an official Speed Dreams release. The original project does not accept AI-generated upstream contributions. No new driving physics or substitute racing game is included here.
