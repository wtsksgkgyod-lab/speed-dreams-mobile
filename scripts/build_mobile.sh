#!/usr/bin/env bash
# Reproduce wasmga.me's pinned Speed Dreams build with the C++ touch-input bridge.
# Requires network-enabled Linux, Emscripten 4.0.7 in PATH, git, CMake, make,
# Python 3, Node/npm. Never edits or submits to official upstream.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${SD_MOBILE_WORK:-$ROOT/.work}"
FORK="$WORK/speed-dreams-wasm"
FORK_REV=87fd141f92450405d795b15d91c276a6faf0882d # observed 2026-11-14
OUT="$ROOT/web"
mkdir -p "$WORK" "$OUT/game" "$OUT/data" "$OUT/vendor"
for cmd in emcc emcmake git cmake make node npm python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: missing $cmd. Activate Emscripten 4.0.7 and retry." >&2; exit 2
  fi
done
if [[ ! -d "$FORK/.git" ]]; then
  git clone --branch wasmgame --depth 1 https://github.com/wasmga-me/speed-dreams-wasm.git "$FORK"
fi
# Pin the web-port HEAD to a known SHA where possible. The official engine, 
# dependencies and content are pinned by upstream's own wasmgame/build.sh.
git -C "$FORK" fetch --depth 1 origin "$FORK_REV"
git -C "$FORK" checkout --detach "$FORK_REV"
echo "Fork source commit: $(git -C "$FORK" rev-parse HEAD)" | tee "$WORK/versions.txt"
python3 "$ROOT/scripts/inject_build.py" "$FORK/wasmgame/build.sh" "$ROOT/scripts/apply_native.py"
# Jobs intentionally capped for runners with 6 GiB RAM.
export JOBS="${JOBS:-2}"
sh "$FORK/wasmgame/build.sh" "$WORK/compile"
cp "$FORK/wasmgame/speeddreams.js" "$OUT/game/"
cp "$FORK/wasmgame/speeddreams.wasm" "$OUT/game/"
cp "$FORK/wasmgame/packs.json" "$WORK/packs.json"
cp "$WORK/compile/r2/speeddreams/"*.zip "$OUT/data/"
mkdir -p "$WORK/vendor"
npm --prefix "$WORK/vendor" install --no-save --ignore-scripts --no-audit --no-fund fflate@0.8.2
cp "$WORK/vendor/node_modules/fflate/umd/index.js" "$OUT/vendor/fflate.js"
if [[ -f "$WORK/vendor/node_modules/fflate/LICENSE" ]]; then
  cp "$WORK/vendor/node_modules/fflate/LICENSE" "$OUT/vendor/fflate-LICENSE.txt"
elif [[ -f "$WORK/vendor/node_modules/fflate/LICENSE.md" ]]; then
  cp "$WORK/vendor/node_modules/fflate/LICENSE.md" "$OUT/vendor/fflate-LICENSE.txt"
else
  echo "Missing fflate license. Audit this npm package before release." >&2; exit 3
fi
python3 "$ROOT/scripts/create_manifest.py" "$OUT" "$WORK/packs.json" "$WORK/versions.txt"
# GPL corresponding sources: pinned upstream with applied patches, pinned
# browser fork, and this project's own integration are shipped with binaries.
mkdir -p "$OUT/source"
tar --exclude=.git -czf "$OUT/source/upstream-with-mobile-patch.tar.gz" -C "$WORK/compile" speed-dreams-code
tar --exclude=.git --exclude=speeddreams.wasm --exclude=speeddreams.js \
    -czf "$OUT/source/wasmga-browser-port.tar.gz" -C "$WORK" speed-dreams-wasm
tar --exclude=.work --exclude='*.wasm' --exclude='*.zip' --exclude='*.png' \
    --exclude=source -czf "$OUT/source/sd-mobile-integration.tar.gz" -C "$ROOT" native scripts web tests docs .github README.md package.json
python3 "$ROOT/scripts/verify_release.py" "$OUT"
node --test "$ROOT/tests/"*.test.mjs
printf '\nBuild complete. Publish the web/ directory using a static host that serves .wasm as application/wasm.\n'
