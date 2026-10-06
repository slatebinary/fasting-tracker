#!/usr/bin/env python3
from pathlib import Path
import json, shutil
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'_site'
if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir(parents=True)
info=json.loads((ROOT/'version.json').read_text(encoding='utf-8'))
paths=set(info.get('shell') or [])|{'./version.json','./sw.js','./robots.txt','./sitemap.xml','./_config.yml'}
for item in sorted(paths):
    clean=item.split('?',1)[0].split('#',1)[0]
    if clean in ('./',''):
        src=ROOT/'index.html'; dst=OUT/'index.html'
    else:
        rel=clean[2:] if clean.startswith('./') else clean.lstrip('/')
        src=ROOT/rel
        if clean.endswith('/'):
            src=src/'index.html'; dst=OUT/rel/'index.html'
        else: dst=OUT/rel
    if not src.is_file(): raise SystemExit(f'missing deployment asset: {item} -> {src}')
    dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(src,dst)
print(f'Prepared {len(paths)} validated deployment entries in {OUT}')
