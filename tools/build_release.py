#!/usr/bin/env python3
from pathlib import Path
import hashlib, json, re, sys

ROOT = Path(__file__).resolve().parents[1]
VERSION_FILE = ROOT / 'version.json'
FRONT_MATTER = re.compile(r'^---\r?\n.*?\r?\n---\r?\n', re.S)

def source_path(shell_path: str) -> Path:
    clean = shell_path.split('?',1)[0].split('#',1)[0]
    if clean in ('./',''):
        return ROOT / 'index.html'
    rel = clean[2:] if clean.startswith('./') else clean.lstrip('/')
    p = ROOT / rel
    if clean.endswith('/'):
        p = p / 'index.html'
    return p

def canonical_bytes(path: Path) -> bytes:
    data = path.read_bytes()
    if path.suffix.lower() == '.html':
        text = data.decode('utf-8')
        text = FRONT_MATTER.sub('', text, count=1)
        text = text.replace('{{ site.github.url }}', '__SITE_URL__')
        text = text.replace('{{ site.github.repository_url }}', '__REPO_URL__')
        text = text.replace('\r\n','\n').replace('\r','\n')
        return text.encode('utf-8')
    return data

def main():
    info = json.loads(VERSION_FILE.read_text(encoding='utf-8'))
    shell = info.get('shell')
    if not isinstance(shell, list) or not shell:
        raise SystemExit('version.json has no shell list')
    hashes = {}
    for item in shell:
        p = source_path(item)
        if not p.is_file():
            raise SystemExit(f'missing shell asset: {item} -> {p}')
        hashes[item] = hashlib.sha256(canonical_bytes(p)).hexdigest()
    info['integrityAlgorithm'] = 'SHA-256'
    info['htmlNormalization'] = 'github-pages-v1'
    info['hashes'] = hashes
    VERSION_FILE.write_text(json.dumps(info, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Updated {VERSION_FILE.name} with {len(hashes)} SHA-256 release hashes.')

if __name__ == '__main__':
    main()
