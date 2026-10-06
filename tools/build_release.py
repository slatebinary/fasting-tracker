#!/usr/bin/env python3
from pathlib import Path
import argparse, hashlib, json, re, sys

ROOT = Path(__file__).resolve().parents[1]
VERSION_FILE = ROOT / 'version.json'
FRONT_MATTER = re.compile(r'^---\r?\n.*?\r?\n---\r?\n', re.S)
VERSION_RE = re.compile(r'^\d+\.\d+\.\d+$')

def source_path(shell_path: str) -> Path:
    clean = shell_path.split('?',1)[0].split('#',1)[0]
    if clean in ('./',''): return ROOT / 'index.html'
    rel = clean[2:] if clean.startswith('./') else clean.lstrip('/')
    p = ROOT / rel
    if clean.endswith('/'): p = p / 'index.html'
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

def stamp_text(path: Path, version: str):
    text=path.read_text(encoding='utf-8'); original=text
    if path.name=='index.html' and path.parent==ROOT:
        text=re.sub(r'(<meta name="ft-app-version" content=")[^"]+("\s*/>)',rf'\g<1>{version}\2',text,count=1)
        text=re.sub(r"(const APP_VERSION\s*=\s*')[^']+(';)",rf'\g<1>{version}\2',text,count=1)
    if path.name in {'about.html','privacy.html','branding.html','license.html'}:
        text=re.sub(r'v\d+\.\d+\.\d+',f'v{version}',text)
    if text!=original: path.write_text(text,encoding='utf-8')

def stamp_version(info):
    version=str(info.get('version','')).strip()
    if not VERSION_RE.match(version): raise SystemExit('version.json version must be semantic X.Y.Z')
    for rel in ['index.html','about.html','privacy.html','branding.html','license.html']:
        stamp_text(ROOT/rel,version)
    source=ROOT/'i18n-source.json'
    if source.is_file():
        payload=json.loads(source.read_text(encoding='utf-8'));payload['appVersion']=version
        source.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def build_hashes(info):
    shell=info.get('shell')
    if not isinstance(shell,list) or not shell: raise SystemExit('version.json has no shell list')
    hashes={}
    for item in shell:
        p=source_path(item)
        if not p.is_file(): raise SystemExit(f'missing shell asset: {item} -> {p}')
        hashes[item]=hashlib.sha256(canonical_bytes(p)).hexdigest()
    return hashes

def verify_stamp(info):
    version=info['version']; index=(ROOT/'index.html').read_text(encoding='utf-8')
    checks=[f'<meta name="ft-app-version" content="{version}"' in index,f"const APP_VERSION = '{version}';" in index]
    for rel in ['about.html','privacy.html','branding.html','license.html']:
        checks.append(f'v{version}' in (ROOT/rel).read_text(encoding='utf-8'))
    source=json.loads((ROOT/'i18n-source.json').read_text(encoding='utf-8'));checks.append(source.get('appVersion')==version)
    if not all(checks): raise SystemExit('release version is not stamped consistently; run tools/build_release.py')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--check',action='store_true');args=ap.parse_args()
    info=json.loads(VERSION_FILE.read_text(encoding='utf-8'))
    if args.check:
        verify_stamp(info); expected=build_hashes(info)
        if info.get('integrityAlgorithm')!='SHA-256' or info.get('htmlNormalization')!='github-pages-v1' or info.get('hashes')!=expected:
            raise SystemExit('release hashes/metadata are stale; run tools/build_release.py and commit the result')
        print(f"Release v{info['version']} is consistently stamped and {len(expected)} shell hashes match.")
        return
    stamp_version(info); info=json.loads(VERSION_FILE.read_text(encoding='utf-8'))
    info['integrityAlgorithm']='SHA-256';info['htmlNormalization']='github-pages-v1';info['hashes']=build_hashes(info)
    VERSION_FILE.write_text(json.dumps(info,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(f"Stamped release v{info['version']} and updated {len(info['hashes'])} SHA-256 release hashes.")
if __name__=='__main__': main()
