#!/usr/bin/env python3
"""Export the canonical English translation source from index.html.
Requires Node.js, which is also used by the release tests for JavaScript syntax checks.
"""
from pathlib import Path
import json, re, subprocess, tempfile
ROOT=Path(__file__).resolve().parents[1]
index=(ROOT/'index.html').read_text(encoding='utf-8')
scripts=re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',index,re.S)
main=next(x for x in scripts if 'const APP_VERSION' in x)
a=main.index('  const I18N = {')
b=main.index('\n  };',a)+5
block=main[a:b]
rev_match=re.search(r'const I18N_SOURCE_REVISION\s*=\s*(\d+)',main)
ver_match=re.search(r"const APP_VERSION\s*=\s*'([^']+)'",main)
with tempfile.NamedTemporaryFile('w',suffix='.js',delete=False,encoding='utf-8') as f:
    f.write(block+'\nconsole.log(JSON.stringify(I18N.en));\n')
    tmp=f.name
strings=json.loads(subprocess.check_output(['node',tmp],text=True))
payload={
    'sourceRevision': int(rev_match.group(1)),
    'appVersion': ver_match.group(1),
    'language': 'en',
    'strings': strings,
}
(ROOT/'i18n-source.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f"Wrote {len(strings)} canonical English strings to i18n-source.json")
