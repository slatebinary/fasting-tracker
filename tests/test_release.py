#!/usr/bin/env python3
from pathlib import Path
import hashlib, json, re, subprocess, sys, tempfile, xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
errors=[]

def ok(cond,msg):
    if not cond: errors.append(msg)

def source_path(shell_path):
    clean=shell_path.split('?',1)[0].split('#',1)[0]
    if clean in ('./',''): return ROOT/'index.html'
    rel=clean[2:] if clean.startswith('./') else clean.lstrip('/')
    p=ROOT/rel
    if clean.endswith('/'): p=p/'index.html'
    return p

fm=re.compile(r'^---\r?\n.*?\r?\n---\r?\n',re.S)
def canonical_bytes(path):
    data=path.read_bytes()
    if path.suffix.lower()=='.html':
        text=data.decode('utf-8')
        text=fm.sub('',text,count=1)
        text=text.replace('{{ site.github.url }}','__SITE_URL__').replace('{{ site.github.repository_url }}','__REPO_URL__')
        text=text.replace('\r\n','\n').replace('\r','\n')
        return text.encode()
    return data

index=(ROOT/'index.html').read_text()
sw=(ROOT/'sw.js').read_text()
ver=json.loads((ROOT/'version.json').read_text())
ok(ver.get('version')=='1.5.0','version must be 1.5.0')
ok(ver.get('released')=='2026-09-29','release date must be 2026-09-29')
ok(ver.get('integrityAlgorithm')=='SHA-256','missing SHA-256 integrity metadata')
ok(ver.get('htmlNormalization')=='github-pages-v1','wrong HTML integrity normalization')
for item in ver.get('shell',[]):
    p=source_path(item); ok(p.is_file(),f'missing shell asset {item}')
    if p.is_file(): ok(hashlib.sha256(canonical_bytes(p)).hexdigest()==ver.get('hashes',{}).get(item),f'hash mismatch {item}')
ok(set(ver.get('hashes',{}))==set(ver.get('shell',[])),'hash map must exactly match shell')
# Simulate GitHub Pages rendering and the service worker's HTML normalization.
site_url='https://example.github.io/fasting-tracker'
repo_url='https://github.com/example/fasting-tracker'
for item in ver.get('shell',[]):
    p=source_path(item)
    if p.suffix.lower()!='.html':
        continue
    src=p.read_text()
    rendered=fm.sub('',src,count=1).replace('{{ site.github.url }}',site_url).replace('{{ site.github.repository_url }}',repo_url)
    normalized=rendered.replace('\r\n','\n').replace('\r','\n').replace(site_url,'__SITE_URL__')
    normalized=re.sub(r'https://github\.com/[^/"\'<>\s]+/[^/"\'<>\s]+','__REPO_URL__',normalized)
    ok(hashlib.sha256(normalized.encode()).hexdigest()==ver['hashes'][item],f'GitHub Pages normalized hash mismatch {item}')
ok('responseDigestHex' in sw and 'integrity check failed' in sw,'service worker integrity verification missing')
ok('validateImportedData(JSON.parse(raw))' in index,'live stored data is not strictly validated')
ok('data = validateImportedData(selected.data);' in index,'recovery snapshot restore is not strictly validated')
ok('navigator.storage.persisted' in index and 'storageProtectionStatus' in index,'storage protection UI missing')
ok('installStorageNotice' in index and 'isStandaloneApp' in index,'Safari/Home Screen storage warning missing')
ok("'backup.noneYet':'No external backup yet'" in index,'missing first-backup empty-state label')
ok('function hasBackupWorthyData()' in index and 'if (!hasBackupWorthyData()) return false;' in index,'empty installations must not show backup reminder')
ok('firstDataAt' in index,'backup reminder must track first meaningful data')
ok('<meta name="referrer" content="no-referrer"' in index,'index referrer policy missing')
for rel in ['about.html','privacy.html','404.html','en/index.html','bg/index.html','es/index.html']:
    txt=(ROOT/rel).read_text(); ok('<meta name="referrer" content="no-referrer"' in txt,f'{rel} referrer policy missing')
ok('Safari and an installed Home Screen web app can use separate local storage' in (ROOT/'privacy.html').read_text(),'privacy storage-separation disclosure missing')
ok((ROOT/'LICENSE').is_file(),'LICENSE missing')
license_text=(ROOT/'LICENSE').read_text()
ok('MIT License' in license_text and 'Permission is hereby granted, free of charge' in license_text,'standard MIT license text missing')
ok((ROOT/'BRANDING.md').is_file(),'BRANDING.md missing')
branding_text=(ROOT/'BRANDING.md').read_text()
ok('not licensed for reuse under the MIT License' in branding_text and 'No trademark, service-mark, trade-name, logo, or other brand rights are granted' in branding_text,'reserved-branding policy missing')
about_text=(ROOT/'about.html').read_text()
ok('License &amp; branding' in about_text and 'Лиценз и брандинг' in about_text and 'Licencia y marca' in about_text,'localized licensing section missing from About')
# manifests
for rel in ['manifest.webmanifest','manifest-bg.webmanifest','manifest-es.webmanifest']:
    json.loads((ROOT/rel).read_text())
ok(json.loads((ROOT/'manifest-bg.webmanifest').read_text()).get('start_url','').endswith('?lang=bg'),'Bulgarian manifest start_url')
ok(json.loads((ROOT/'manifest-es.webmanifest').read_text()).get('start_url','').endswith('?lang=es'),'Spanish manifest start_url')
smap=fm.sub('', (ROOT/'sitemap.xml').read_text(), count=1)
ET.fromstring(smap)
# JS syntax
scripts=re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',index,re.S)
main=next((x for x in scripts if 'const APP_VERSION' in x),None)
ok(main is not None,'main app script not found')
if main:
    with tempfile.NamedTemporaryFile('w',suffix='.js',delete=False,encoding='utf-8') as f:
        f.write(main); jsfile=f.name
    cp=subprocess.run(['node','--check',jsfile],capture_output=True,text=True)
    ok(cp.returncode==0,'main JavaScript syntax error: '+cp.stderr)
cp=subprocess.run(['node','--check',str(ROOT/'sw.js')],capture_output=True,text=True)
ok(cp.returncode==0,'service worker syntax error: '+cp.stderr)
# Translation parity from object sections.
langs={}
for lang,next_lang in [('en','bg'),('bg','es')]:
    a=index.index(f'    {lang}: {{'); b=index.index(f'    {next_lang}: {{',a)
    langs[lang]=set(re.findall(r"'([^']+)'\s*:",index[a:b]))
a=index.index('    es: {'); b=index.index('\n    }\n  };',a)+6
langs['es']=set(re.findall(r"'([^']+)'\s*:",index[a:b]))
ok(langs['en']==langs['bg']==langs['es'],f'translation key mismatch: {[len(langs[x]) for x in ["en","bg","es"]]}')
refs_i18n=set(re.findall(r'data-i18n(?:-html|-aria)?="([^"]+)"',index)) | set(re.findall(r"\bt\('([^']+)'",main or ''))
missing_i18n=sorted(refs_i18n-langs['en'])
ok(not missing_i18n,'missing translation keys: '+','.join(missing_i18n[:20]))
# DOM ID references
ids=set(re.findall(r'\bid="([^"]+)"',index))
refs=set(re.findall(r"\bel\('([^']+)'\)",index))
missing=sorted(refs-ids)
ok(not missing,'missing DOM IDs: '+','.join(missing[:10]))
# No indexing restrictions
allhtml='\n'.join((ROOT/p).read_text() for p in ['index.html','about.html','privacy.html','404.html','en/index.html','bg/index.html','es/index.html'])
ok('noindex' not in allhtml.lower() and 'nofollow' not in allhtml.lower(),'noindex/nofollow remains')
# Core algorithm tests using actual extracted function declarations.
def extract_func(name):
    pos=main.find(f'function {name}(')
    if pos<0: raise RuntimeError(name)
    brace=main.find('{',pos); depth=0
    for i in range(brace,len(main)):
        if main[i]=='{': depth+=1
        elif main[i]=='}':
            depth-=1
            if depth==0: return main[pos:i+1]
    raise RuntimeError(name)
fnames=['validDate','pad','parseLocalizedNumber','currentTimeZone','isValidTimeZone','normalizeTimeZone','zonedParts','timeZoneOffsetMs','zonedLocalToDate','dayKey','nextZonedDayBoundary','addIntervalToDayMap','compareVersions']
try:
    extracted='\n'.join(extract_func(n) for n in fnames)
    node_test=extracted+r'''
function assert(c,m){if(!c)throw new Error(m)}
assert(validDate(null)===null,'null date must not become Unix epoch');
assert(validDate('')===null,'empty date must be invalid');
assert(parseLocalizedNumber('80,5')===80.5,'comma decimal');
assert(parseLocalizedNumber('1.234,5')===1234.5,'EU grouped decimal');
assert(parseLocalizedNumber('1,234.5')===1234.5,'US grouped decimal');
assert(zonedLocalToDate('2026-01-15T12:00','Europe/Sofia') instanceof Date,'normal Sofia time');
assert(zonedLocalToDate('2026-03-29T03:30','Europe/Sofia')===null,'spring DST gap');
assert(zonedLocalToDate('2026-10-25T03:30','Europe/Sofia')===null,'autumn DST ambiguity');
assert(compareVersions('1.0.1','1.0.0')>0,'version compare upgrade');
assert(compareVersions('1.0.0','1.0.0')===0,'version compare equal');
const m=new Map();addIntervalToDayMap(m,'2026-09-01T00:00:00Z','2026-09-03T00:00:00Z','UTC');
console.log([...m.entries()]); assert(Math.abs((m.get('2026-09-01')||0)-86400000)<2000 && Math.abs((m.get('2026-09-02')||0)-86400000)<2000,'multi-day allocation');
console.log('algorithm regression tests passed');
'''
    with tempfile.NamedTemporaryFile('w',suffix='.js',delete=False,encoding='utf-8') as f:
        f.write(node_test); tf=f.name
    cp=subprocess.run(['node',tf],capture_output=True,text=True)
    ok(cp.returncode==0,'algorithm regression tests failed: '+cp.stderr)
except Exception as e:
    errors.append('could not build algorithm regression tests: '+str(e))

# Backdated active-fast feature regression checks
ok('id="startEarlierBtn"' in index and 'id="backdateModal"' in index,'backdated active-fast UI missing')
ok('function saveBackdatedActiveFast()' in index and 'function setBackdatePreset(hours)' in index,'backdated active-fast logic missing')
ok("'backdate.errOverlap'" in index and "'fasting.startEarlier'" in index,'backdated active-fast localization missing')
ok('data.activeStart = start.toISOString();' in index and 'data.activeGoalHours = data.goalHours;' in index,'backdated active fast must persist start and locked target')


# Selectable app-icon regression checks
for icon in ('plate','moon','hourglass','timer'):
    for name in ('icon-192.png','icon-512.png','apple-touch-icon.png','favicon-32.png'):
        ok((ROOT/'icons'/icon/name).is_file(), f'missing icon variant {icon}/{name}')
for icon in ('moon','hourglass','timer'):
    for suffix in ('','-bg','-es'):
        ok((ROOT/f'manifest-{icon}{suffix}.webmanifest').is_file(), f'missing manifest for {icon}{suffix}')
html_text=(ROOT/'index.html').read_text(encoding='utf-8')
for key in ("data-icon-choice=\"plate\"","data-icon-choice=\"moon\"","data-icon-choice=\"hourglass\"","data-icon-choice=\"timer\""):
    ok(key in html_text, f'missing icon selector {key}')
ok("iconChoice: 'plate'" in html_text, 'default icon choice missing')
ok('function applyIconChoice()' in html_text, 'applyIconChoice missing')

if errors:
    print('FAIL')
    for e in errors: print(' -',e)
    sys.exit(1)
ok("'help.installAndroid'" in index and "'help.installIOS'" in index, 'separate iOS/Android installation localization missing')
for mf in ['manifest.webmanifest','manifest-bg.webmanifest','manifest-es.webmanifest','manifest-moon.webmanifest','manifest-hourglass.webmanifest','manifest-timer.webmanifest']:
    mm=json.loads((ROOT/mf).read_text())
    ok(any(i.get('purpose')=='maskable' for i in mm.get('icons',[])), f'maskable Android icon missing in {mf}')

# Rolling internal snapshot + one-tap reminder regression checks
ok('SNAPSHOT_RECENT_KEEP = 5' in index and 'SNAPSHOT_DAILY_KEEP = 7' in index and 'SNAPSHOT_WEEKLY_KEEP = 4' in index and 'SNAPSHOT_MONTHLY_KEEP = 6' in index, 'rolling snapshot retention constants missing')
ok('function pruneSnapshots(' in index and 'function maybeCreateRollingSnapshot(' in index, 'rolling snapshot logic missing')
ok("maybeCreateRollingSnapshot('automatic change')" in index, 'automatic snapshots are not created after saves')
ok('id="settingsBackupNowBtn"' in index and "settingsBackupNowBtn').addEventListener('click', exportBackup)" in index, 'one-tap Settings backup action missing')
ok('id="nextBackupLabel"' in index and 'backup.nextReminder' in index, 'next external backup reminder UI missing')
privacy_text=(ROOT/'privacy.html').read_text()
ok('5 recent, 7 daily, 4 weekly and 6 monthly' in privacy_text and '5 последни, 7 дневни, 4 седмични и 6 месечни' in privacy_text and '5 recientes, 7 diarias, 4 semanales y 6 mensuales' in privacy_text, 'localized rolling-backup privacy explanations missing')

print('PASS: release, integrity, localization, DOM, storage/privacy and algorithm regression checks')

# iPhone button-layout regression checks
index_text=(ROOT/'index.html').read_text(encoding='utf-8')
ok('white-space: nowrap' in index_text and '#settings .row > button' in index_text, 'Settings action buttons must not split words')
ok('@media (max-width: 520px)' in index_text, 'Settings rows should be allowed to wrap on iPhone widths')

# Active-fast target clock-time feature
ok('id="targetMoment"' in index, 'target moment element missing')
ok('fasting.expectedTargetTime' in index and 'fasting.targetTimePassed' in index, 'target-time translations missing')
ok('new Date(startMs + targetMs)' in index, 'target time calculation missing')
