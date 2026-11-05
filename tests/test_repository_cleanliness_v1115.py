#!/usr/bin/env python3
"""Verify tracked release contents exclude generated caches and obsolete root files."""
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]
assert (ROOT/'.gitignore').is_file(), '.gitignore missing from release'
ignore=(ROOT/'.gitignore').read_text(encoding='utf-8')
for token in ('__pycache__/','*.pyc','*.pyo','Thumbs.db','.DS_Store'):
    assert token in ignore, token

# Test execution itself creates ignored __pycache__ files. Inspect the Git
# index rather than the mutable working tree so this check is deterministic.
tracked=subprocess.run(
    ['git','ls-files','-z'],cwd=ROOT,check=True,capture_output=True
).stdout.decode('utf-8').split('\0')
bad=[]
for rel in filter(None,tracked):
    path=Path(rel)
    if '__pycache__' in path.parts or path.suffix in ('.pyc','.pyo') or rel in ('all.js','main.js'):
        bad.append(rel)
assert not bad, bad
print('PASS: tracked release tree is clean and generated/obsolete files are excluded')
