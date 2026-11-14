#!/usr/bin/env python3
"""Fails a release missing the original compiled simulation or source bundles.
A pass means package-integrity only, not that driving or performance passed.
"""
import hashlib,json,pathlib,sys
web=pathlib.Path(sys.argv[1])
m=json.loads((web/'app-manifest.json').read_text())
assert m['runtime']['js']=='./game/speeddreams.js'
wasm=web/'game/speeddreams.wasm'
assert wasm.read_bytes()[:4]==b'\x00asm','Missing actual WebAssembly module'
assert wasm.stat().st_size>100000,'Unrealistically small WASM module'
assert (web/'game/speeddreams.js').stat().st_size>10000,'Missing glue runtime'
assert (web/'vendor/fflate.js').stat().st_size>5000,'Missing ZIP decoder'
for pack,info in m['packs'].items():
    path=web/info['url'].replace('./','',1)
    assert path.is_file(),f'Missing {pack}'
    assert hashlib.sha256(path.read_bytes()).hexdigest()==info['sha256'],f'Corrupt {pack}'
for name in ['upstream-with-mobile-patch.tar.gz','wasmga-browser-port.tar.gz','sd-mobile-integration.tar.gz']:
    path=web/'source'/name
    assert path.is_file() and path.stat().st_size>1000,f'Missing corresponding source: {name}'
print('PASS: WASM package integrity and accompanying source bundles')
