#!/usr/bin/env python3
"""Build data-pack URLs from the actual output, with SHA-256 validation."""
import hashlib,json,pathlib,re,sys
out=pathlib.Path(sys.argv[1]);packs=json.loads(pathlib.Path(sys.argv[2]).read_text())
version=pathlib.Path(sys.argv[3]).read_text().strip()
seen={}
for path in sorted((out/'data').glob('*.zip')):
    match=re.fullmatch(r'(.+)-([0-9a-f]{12})\.zip',path.name)
    if not match:raise RuntimeError(f'Unrecognized ZIP name: {path.name}')
    name=match.group(1)
    sha=hashlib.sha256(path.read_bytes()).hexdigest()
    if sha[:12]!=match.group(2):raise RuntimeError(f'ZIP content hash differs: {path.name}')
    if name in seen:raise RuntimeError(f'Duplicate pack {name}')
    seen[name]={'url':f'./data/{path.name}','sha256':sha,'bytes':path.stat().st_size}
for required in ['start','music',*packs.keys()]:
    if required not in seen:raise RuntimeError(f'Unbuilt pack: {required}')
for name in ['speeddreams.js','speeddreams.wasm']:
    if not (out/'game'/name).is_file():raise RuntimeError(f'Missing runtime: {name}')
manifest={
    'name':'Speed Dreams Mobile / Independent fork',
    'build':version,
    'runtime':{'js':'./game/speeddreams.js','wasm':'./game/speeddreams.wasm'},
    'packs':seen,'packPaths':packs,
}
(out/'app-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Wrote manifest with',len(seen),'integrity-checked asset packs')
