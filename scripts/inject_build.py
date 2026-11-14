#!/usr/bin/env python3
"""Inject a self-contained mobile patch in wasmga.me's pinned build script.

The script is idempotent across repeated CI attempts. It inserts the patch after
upstream's existing speeddreams.diff application but before CMake compilation.
"""
import pathlib,shlex,sys
build=pathlib.Path(sys.argv[1]);patch=pathlib.Path(sys.argv[2])
source=build.read_text()
anchor='git -C "$sd" apply "$here/speeddreams.diff"'
marker='# SD_MOBILE_INPUT_PATCH'
if marker not in source:
    assert source.count(anchor)==1, 'Unexpected wasmga.me build.sh revision; fail closed'
    injection=(marker+'\npython3 '+shlex.quote(str(patch))+' "$sd/src/libs/robottools/rthumandriver.cpp"')
    source=source.replace(anchor,anchor+'\n'+injection,1)
    build.write_text(source)
print('Mobile patch injection checked')
