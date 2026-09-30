#!/usr/bin/env python3
"""Export canonical English translation source from i18n/en.json."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
index=(ROOT/'index.html').read_text(encoding='utf-8')
rev_match=re.search(r'const I18N_SOURCE_REVISION\s*=\s*(\d+)',index)
ver_match=re.search(r"const APP_VERSION\s*=\s*'([^']+)'",index)
strings=json.loads((ROOT/'i18n'/'en.json').read_text(encoding='utf-8'))
payload={
    'sourceRevision': int(rev_match.group(1)),
    'appVersion': ver_match.group(1),
    'language': 'en',
    'strings': strings,
}
(ROOT/'i18n-source.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f"Wrote {len(strings)} canonical English strings to i18n-source.json")
