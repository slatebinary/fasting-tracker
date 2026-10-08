#!/usr/bin/env python3
"""v1.12.2: release tree contains no generated/cache or obsolete root leftovers."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
assert (ROOT/'.gitignore').is_file(), '.gitignore missing from release'
ignore=(ROOT/'.gitignore').read_text(encoding='utf-8')
for token in ('__pycache__/','*.pyc','*.pyo','Thumbs.db','.DS_Store'):
    assert token in ignore, token
bad=[]
for p in ROOT.rglob('*'):
    rel=p.relative_to(ROOT).as_posix()
    if '__pycache__' in p.parts or p.suffix in ('.pyc','.pyo') or rel in ('all.js','main.js'):
        bad.append(rel)
assert not bad, bad
print('PASS: v1.12.2 release tree is clean and generated/obsolete files are excluded')
