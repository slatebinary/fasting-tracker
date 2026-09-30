#!/usr/bin/env python3
"""Build small browser translation bundles from editable JSON dictionaries."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
I18N=ROOT/'i18n'
for path in sorted(I18N.glob('*.json')):
    code=path.stem
    data=json.loads(path.read_text(encoding='utf-8'))
    out=("window.FT_I18N=window.FT_I18N||{};\n"
         f"window.FT_I18N[{json.dumps(code)}]={json.dumps(data,ensure_ascii=False,separators=(',',':'))};\n")
    (I18N/f'{code}.js').write_text(out,encoding='utf-8')
    print(f'Built i18n/{code}.js with {len(data)} strings')
