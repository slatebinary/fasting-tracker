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
ok(ver.get('version')=='1.7.2','version must be 1.7.2')
ok(ver.get('released')=='2026-09-30','release date must be 2026-09-30')
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
ok('validateCompatibleData(JSON.parse(raw))' in index and 'return { data: validateImportedData(prepared.data), changed: prepared.changed };' in index,'live stored data compatibility bridge must end in strict validation')
ok('data = validateCompatibleData(selected.data).data;' in index,'recovery snapshot restore is not compatibility-validated')
ok('navigator.storage.persisted' in index and 'storageProtectionStatus' in index,'storage protection UI missing')
ok('installStorageNotice' in index and 'isStandaloneApp' in index,'Safari/Home Screen storage warning missing')
ok("'backup.noneYet':'No external backup yet'" in index,'missing first-backup empty-state label')
ok('function hasBackupWorthyData()' in index and 'if (!hasBackupWorthyData()) return false;' in index,'empty installations must not show backup reminder')
ok('firstDataAt' in index,'backup reminder must track first meaningful data')
ok('<meta name="referrer" content="no-referrer"' in index,'index referrer policy missing')
for rel in ['about.html','privacy.html','branding.html','license.html','404.html','en/index.html','bg/index.html','es/index.html']:
    txt=(ROOT/rel).read_text(); ok('<meta name="referrer" content="no-referrer"' in txt,f'{rel} referrer policy missing')
ok('Safari and an installed Home Screen web app can use separate local storage' in (ROOT/'privacy.html').read_text(),'privacy storage-separation disclosure missing')
ok((ROOT/'LICENSE').is_file(),'LICENSE missing')
license_text=(ROOT/'LICENSE').read_text()
ok('MIT License' in license_text and 'Permission is hereby granted, free of charge' in license_text,'standard MIT license text missing')
ok((ROOT/'BRANDING.md').is_file(),'BRANDING.md missing')
branding_text=(ROOT/'BRANDING.md').read_text()
ok('not licensed for reuse under the MIT License' in branding_text and 'No trademark, service-mark, trade-name, logo, or other brand rights are granted' in branding_text,'reserved-branding policy missing')
about_text=(ROOT/'about.html').read_text()
privacy_text=(ROOT/'privacy.html').read_text()
ok('License &amp; branding' in about_text and 'Лиценз и брандинг' in about_text and 'Licencia y marca' in about_text,'localized licensing section missing from About')
ok('data-set-lang' not in about_text and 'fastingTrackerPublicLang' not in about_text,'About must not have an independent language switcher')
ok('data-set-lang' not in privacy_text and 'fastingTrackerPublicLang' not in privacy_text,'Privacy must not have an independent language switcher')
ok('href="branding.html"' in about_text and 'href="license.html"' in about_text, 'About must use navigable Branding/License pages')
ok('href="BRANDING.md"' not in about_text and 'href="LICENSE"' not in about_text, 'About must not navigate users to raw legal text files')
for rel in ['about.html','privacy.html','branding.html','license.html']:
    txt=(ROOT/rel).read_text()
    ok('id="backAppLink"' in txt and 'Back to Fasting Tracker' in txt, f'{rel} missing explicit return-to-app control')
ok("explicitAppLang || (appPref==='system'?systemLang" in about_text,'About must follow the application language')
ok("explicitAppLang || (appPref==='system'?systemLang" in privacy_text,'Privacy must follow the application language')
ok('navigator.languages[0]' in index and "return SUPPORTED_LANGUAGES.includes(base) ? base : 'en';" in index, 'main app must use primary host language and fall back to English')
for rel in ['about.html','privacy.html','branding.html','license.html','404.html']:
    txt=(ROOT/rel).read_text()
    fallback_ok=("allowed.includes(base)?base:'en'" in txt) or ("allowed.includes(systemBase)?systemBase:'en'" in txt)
    ok('navigator.languages[0]' in txt and fallback_ok, f'{rel} must fall back to English when primary host language is unsupported')
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
allhtml='\n'.join((ROOT/p).read_text() for p in ['index.html','about.html','privacy.html','branding.html','license.html','404.html','en/index.html','bg/index.html','es/index.html'])
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
fnames=['validDate','pad','numberSymbols','parseLocalizedNumber','safeTargetDate','currentTimeZone','isValidTimeZone','normalizeTimeZone','zonedParts','timeZoneOffsetMs','zonedLocalToDate','dayKey','nextZonedDayBoundary','addIntervalToDayMap','compareVersions']
try:
    extracted='\n'.join(extract_func(n) for n in fnames)
    node_test='const MAX_DATE_MS=8.64e15;\n'+extracted+r'''
function assert(c,m){if(!c)throw new Error(m)}
assert(validDate(null)===null,'null date must not become Unix epoch');
assert(validDate('')===null,'empty date must be invalid');
assert(parseLocalizedNumber('1,234','en-US')===1234,'English grouping must stay grouping');
assert(parseLocalizedNumber('80,5','en-US')===80.5,'alternate comma decimal');
assert(parseLocalizedNumber('1.234,5','de-DE')===1234.5,'EU grouped decimal');
assert(parseLocalizedNumber('1,234.5','en-US')===1234.5,'US grouped decimal');
assert(parseLocalizedNumber('1.234','es-ES')===1234,'Spanish grouping');
assert(parseLocalizedNumber('72.5','es-ES')===72.5,'Spanish alternate dot decimal');
assert(parseLocalizedNumber('1 234,5','bg-BG')===1234.5,'Bulgarian spaced grouping');
assert(safeTargetDate(Date.now(),2000000000*3600000) instanceof Date,'supported extreme target date');
assert(safeTargetDate(8.63e15,2e13)===null,'target date overflow guard');
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


# iPhone button-layout regression checks
index_text=(ROOT/'index.html').read_text(encoding='utf-8')
ok('white-space: normal' in index_text and 'word-break: normal' in index_text and '#settings .row > button' in index_text, 'Settings action buttons must wrap at word boundaries without splitting words')
ok('@media (max-width: 520px)' in index_text, 'Settings rows should be allowed to wrap on iPhone widths')

# Active-fast target clock-time feature
ok('id="targetMoment"' in index, 'target moment element missing')
ok('fasting.expectedTargetTime' in index and 'fasting.targetTimePassed' in index, 'target-time translations missing')
ok('safeTargetDate(startMs, targetMs)' in index, 'safe target time calculation missing')
ok('id="appFooterVersion"' in index, 'dynamic footer version element missing')
ok("el('appFooterVersion').textContent = `Fasting Tracker v${APP_VERSION}`;" in index, 'footer version is not driven by APP_VERSION')
ok('Fasting Tracker v1.2.0' not in index and '>v1.2.0<' not in index, 'stale hard-coded v1.2.0 label remains')

# Snapshot-pressure and warning regression checks
ok('function setSnapshotProtectionState(' in index and 'function isQuotaError(' in index, 'snapshot protection health tracking missing')
ok("setSnapshotProtectionState('reduced'" in index and "setSnapshotProtectionState('failed'" in index, 'snapshot storage degradation states missing')
ok('function writePrimaryDataWithSnapshotReclaim(' in index, 'primary data does not reclaim snapshot space under quota pressure')
ok("'backup.autoSnapshotFailed'" in index and "'backup.autoSnapshotReduced'" in index, 'snapshot failure/reduced localization missing')
ok('backupReminderTitle' in index and "banner.classList.toggle('warn', snapshotAttention)" in index, 'persistent one-tap snapshot warning banner missing')
ok('One is created automatically after the first meaningful fasting or weight change.' in index, 'outdated recovery-snapshot empty-state wording remains')
ok('v1.0.0 — FIRST DEPLOYMENT' not in (ROOT/'FIRST-DEPLOYMENT-CHECKLIST.txt').read_text(), 'deployment checklist still tied to v1.0.0')
ok('1.0.0 -> 1.0.1' not in (ROOT/'RELEASE-GUIDE.txt').read_text(), 'release guide still contains obsolete release example')

# Simulate quota pressure with the actual snapshot/reclaim functions.
try:
    pressure_funcs='\n'.join(extract_func(n) for n in ['setSnapshotProtectionState','isQuotaError','writeSnapshotList','storeSnapshots','writePrimaryDataWithSnapshotReclaim'])
    pressure_test=r'''
const DATA_KEY='data', SNAPSHOT_KEY='snaps', SNAPSHOT_RECENT_KEEP=5;
let snapshotProtectionState={status:'ok',kept:0,desired:0}; let backupMeta={};
function saveBackupMeta(){}
function pruneSnapshots(x){return x;}
function loadSnapshots(){try{return JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'[]')}catch{return []}}
class FakeStorage {
  constructor(limit){this.limit=limit;this.m=new Map()}
  totalWith(k,v){let n=0;for(const [kk,vv] of this.m)n += kk===k?0:String(kk).length+String(vv).length; return n+String(k).length+String(v).length}
  setItem(k,v){if(this.totalWith(k,v)>this.limit){const e=new Error('quota');e.name='QuotaExceededError';throw e}this.m.set(k,String(v))}
  getItem(k){return this.m.has(k)?this.m.get(k):null}
  removeItem(k){this.m.delete(k)}
}
function assert(c,m){if(!c)throw new Error(m)}
const localStorage=new FakeStorage(1550);
localStorage.setItem(DATA_KEY,'x'.repeat(350));
const snaps=Array.from({length:8},(_,i)=>({id:'s'+i,payload:'y'.repeat(95)}));
localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(snaps));
writePrimaryDataWithSnapshotReclaim('z'.repeat(850));
assert(localStorage.getItem(DATA_KEY)==='z'.repeat(850),'primary data did not save after snapshot reclaim');
assert(snapshotProtectionState.status==='reduced'||snapshotProtectionState.status==='failed','snapshot pressure not reported');
console.log('quota pressure simulation passed');
'''
    with tempfile.NamedTemporaryFile('w',suffix='.js',delete=False,encoding='utf-8') as f:
        f.write(pressure_funcs+'\n'+pressure_test); pf=f.name
    cp=subprocess.run(['node',pf],capture_output=True,text=True)
    ok(cp.returncode==0,'snapshot quota-pressure simulation failed: '+cp.stderr)
except Exception as e:
    errors.append('could not run snapshot quota-pressure simulation: '+str(e))


# Internationalization-readiness regression checks
ok('const I18N_SOURCE_REVISION = 3;' in index, 'canonical i18n source revision missing')
ok('const LANGUAGE_META = Object.freeze({' in index and 'const SUPPORTED_LANGUAGES' in index, 'central language metadata missing')
ok('new Intl.PluralRules(currentLocale()).select' in index, 'Intl.PluralRules pluralization missing')
ok('function resolveSystemLanguage()' in index and 'navigator.languages' in index, 'system-language resolution is not future-ready')
ok("document.documentElement.dir = meta.dir" in index, 'app direction is not driven by language metadata')
ok('padding-inline-start' in index and 'margin-inline-start' in index and 'text-align: end' in index, 'logical CSS properties for RTL readiness missing')
ok('I18N-GUIDE.md' in [p.name for p in ROOT.iterdir()], 'I18N-GUIDE.md missing')
ok((ROOT/'i18n-source.json').is_file() and (ROOT/'tools/export_i18n_source.py').is_file(), 'canonical i18n source/export tool missing')
ok("if (rawData.language != null && typeof rawData.language !== 'string')" in index, 'future-language backup tolerance missing')
ok("if (!['system','en','bg','es'].includes(rawData.language))" not in index, 'backup import still rejects future language codes')
ok("manifestSuffix" in index and 'function manifestFor(lang, icon)' in index, 'manifest selection is not metadata-driven')
ok("sel.replaceChildren()" in index and 'LANGUAGE_META[code].label' in index, 'language selector options are not metadata-driven')
ok('lang === \'bg\' ?' not in index and "lang === 'es' ?" not in index, 'hard-coded language ternary remains in app logic')
# User-visible dynamic messages must use t(...) rather than direct alert/confirm/prompt literals.
main_src=main or ''
ok(not re.search(r"\b(?:alert|confirm|prompt)\(\s*['\"]", main_src), 'hard-coded alert/confirm/prompt user text remains')
# Existing translations must remain exact-key complete and all referenced keys must exist.
ok(len(langs['en']) >= 300, 'unexpectedly small canonical translation dictionary')
# Evaluate the actual JS dictionaries to verify placeholders and the frozen English source.
try:
    ia=main.index('  const I18N = {'); ib=main.index('\n  };',ia)+5
    i18n_block=main[ia:ib]
    with tempfile.NamedTemporaryFile('w',suffix='.js',delete=False,encoding='utf-8') as f:
        f.write(i18n_block+'\nconsole.log(JSON.stringify(I18N));\n'); i18n_js=f.name
    evaluated=json.loads(subprocess.check_output(['node',i18n_js],text=True))
    canonical=evaluated['en']
    ph=lambda value:set(re.findall(r'\{([A-Za-z0-9_]+)\}',str(value)))
    for key,value in canonical.items():
        for lang in ('bg','es'):
            ok(ph(evaluated[lang][key])==ph(value), f'placeholder mismatch {lang}:{key}')
    plural_bases=['backup.snapshotWord','fasting.fastCount','import.fast','import.weight','unit.day','unit.hour']
    plural_categories=['zero','one','two','few','many','other']
    for base in plural_bases:
        for cat in plural_categories:
            for lang in ('en','bg','es'):
                ok(f'{base}.{cat}' in evaluated[lang], f'missing plural category {lang}:{base}.{cat}')
    source=json.loads((ROOT/'i18n-source.json').read_text())
    ok(source.get('sourceRevision')==3, 'i18n source revision mismatch')
    ok(source.get('appVersion')=='1.7.2', 'i18n source app version mismatch')
    ok(source.get('language')=='en', 'i18n source language must be en')
    ok(source.get('strings')==canonical, 'i18n-source.json is stale; run tools/export_i18n_source.py')
except Exception as e:
    errors.append('could not validate evaluated translation dictionaries: '+str(e))
# Current locale must not force English to GB or Spanish to Spain; region comes from matching browser locale.
ok("'en-GB'" not in index and "'es-ES'" not in index and "'bg-BG'" not in index, 'UI language still forces a country-specific locale')
# Public informational pages must follow app/system language and set document direction from metadata.
for rel in ['about.html','privacy.html']:
    txt=(ROOT/rel).read_text()
    ok('navigator.languages' in txt and 'document.documentElement.dir=m.dir' in txt, f'{rel} not language/direction future-ready')
    ok('document.title=m.title' in txt and 'meta[name=\"description\"]' in txt, f'{rel} localized document metadata missing')
notfound=(ROOT/'404.html').read_text()
ok('navigator.languages' in notfound and 'document.documentElement.dir=meta[lang].dir' in notfound and 'document.title=meta[lang].title' in notfound, '404 language/direction metadata not future-ready')
# Machine backup vocabulary remains stable and untranslated.
ok("const BACKUP_FORMAT = 'fasting-tracker-backup';" in index and "backupVersion: BACKUP_VERSION" in index, 'backup format identity changed')
ok("format: BACKUP_FORMAT" in index and "exportedAt: new Date().toISOString()" in index, 'backup payload no longer uses stable machine fields')

# v1.6.0 intermittent-fasting education regressions
ok('id="ifBasicsCard"' in index and 'data-i18n="if.title"' in index, 'intermittent-fasting basics card missing')
for key in ['if.what','if.examples','if.benefits','if.limits','if.safety','if.src1','if.src2','if.src3','if.src4']:
    ok(key in langs['en'], f'missing intermittent-fasting translation key {key}')
ok('https://www.bmj.com/content/389/bmj-2024-082007' in index, 'BMJ 2025 intermittent-fasting evidence source missing')
ok('https://www.nia.nih.gov/news/research-intermittent-fasting-shows-health-benefits' in index, 'NIA intermittent-fasting source missing')
ok('https://www.nih.gov/news-events/nih-research-matters/time-restricted-eating-metabolic-syndrome' in index, 'NIH time-restricted-eating source missing')
ok('https://www.niddk.nih.gov/health-information/professionals/diabetes-discoveries-practice/patients-intermittent-fasting' in index, 'NIDDK diabetes safety source missing')
ok('What is intermittent fasting?' in about_text and 'Какво е интермитентното гладуване?' in about_text and '¿Qué es el ayuno intermitente?' in about_text, 'localized public intermittent-fasting explanation missing')

# v1.6.0 reliability regressions
ok("if (pref !== 'system') u.searchParams.set('lang', pref);" in index, 'reinstall link must preserve explicit English and other explicit languages')
ok('id="copyReinstallLinkBtn"' in index and "copyReinstallLinkBtn').addEventListener('click', copyReinstallLink)" in index, 'copy reinstall-link button missing')
ok('navigator.clipboard?.writeText' in index and "document.execCommand?.('copy')" in index, 'reinstall-link copy fallbacks missing')
ok("event.key === BACKUP_META_KEY" in index and "event.key === SNAPSHOT_KEY" in index, 'backup/snapshot cross-tab synchronization missing')
ok('function reloadBackupMetaFromStorage()' in index, 'backup metadata reload helper missing')
ok('function numberSymbols(' in index and 'formatToParts(12345.6)' in index, 'locale-aware number symbols missing')
ok('const MAX_DATE_MS = 8.64e15;' in index and 'function safeTargetDate(' in index, 'extreme target-date guard missing')
ok('parsed > MAX_SAFE_GOAL_HOURS' in index, 'extreme goal input is not rejected')
ok('function normalizeBackupClockSkew()' in index and "['firstDataAt','lastExternalBackupAt']" in index, 'backup reminder clock-skew hardening missing')

# v1.6.1 recovery/navigation regressions
ok('function prepareCompatibleData(rawData)' in index and "normalizeAppearance(candidate.appearance)" in index and "typeof candidate.gamificationEnabled !== 'boolean'" in index and "usedFastIds" in index, 'legacy v1 compatibility repair missing')
ok('const compatible = validateCompatibleData(JSON.parse(raw));' in index and 'localStorage.setItem(DATA_KEY, serialized);' in index, 'compatible stored data is not upgraded in place')
ok('const APP_SCREENS' in index and 'activateScreen(location.hash.slice(1), { updateHash: false });' in index, 'return-to-tab routing missing')
ok('target="_blank" rel="noopener" data-i18n="public.privacy"' not in index and 'privacy.html?return=settings' in index, 'Settings privacy link must stay in app context and remember Settings')
ok('about.html?return=fasting#health' in index and 'about.html?return=settings' in index, 'About links do not preserve their originating app screen')
for rel in ['about.html','privacy.html','branding.html','license.html']:
    txt=(ROOT/rel).read_text()
    ok("u.searchParams.set('return',returnScreen)" in txt and "u.hash=returnScreen==='fasting'?'':returnScreen" in txt, f'{rel} does not preserve return screen')

# v1.6.3 startup initialization-order regression
# load() normalizes legacy/localized numeric fields and can call currentLocale() ->
# uiLanguage(). Ensure all lexical bindings read by that path are initialized first.
boot_load = index.index('data = load();')
ok(index.index('let data = cloneDefault();') < boot_load, 'data must be initialized before load()')
ok(index.index('let urlLangOverride =') < boot_load, 'urlLangOverride must be initialized before load()')
ok(index.index('let urlIconOverride =') < boot_load, 'urlIconOverride must be initialized before load()')
ok(index.index('let emergencyBoot =') < boot_load, 'emergencyBoot must be initialized before load()')

# v1.6.2 recovery hardening + exact documentation return regressions
ok("const DOC_RETURN_KEY = 'fastingTracker.documentReturnUrl';" in index and 'sessionStorage.setItem(DOC_RETURN_KEY, location.href)' in index, 'exact documentation return capture missing')
ok('validateCompatibleData(JSON.parse(JSON.stringify(data))).data' in index, 'save must canonicalize data before persistence')
ok('const next = raw ? validateCompatibleData(JSON.parse(raw)).data : cloneDefault();' in index, 'cross-context storage sync must use compatibility repair')
ok("throw new Error('overlapping fasting records')" not in index and "throw new Error('active fast overlaps history')" not in index, 'legacy semantic overlap must not force Recovery mode')
ok('id="recoveryDiagnostic"' in index and "recoveryMode.error" in index, 'Recovery mode diagnostic reason missing')
for rel in ['about.html','privacy.html','branding.html','license.html']:
    txt=(ROOT/rel).read_text()
    ok("const DOC_RETURN_KEY='fastingTracker.documentReturnUrl'" in txt and 'sessionStorage.getItem(DOC_RETURN_KEY)' in txt, f'{rel} exact app-return session state missing')
    ok("const DOC_FROM_PARAM='fromDoc'" in txt and 'previousDocument||exactReturn||fallbackReturn()' in txt, f'{rel} does not prefer the immediately originating document')
    ok('u.searchParams.set(DOC_FROM_PARAM,currentDocumentUrl())' in txt, f'{rel} does not propagate its own URL to child documents')

# v1.6.4 documentation-chain regression:
# Settings -> About -> License/Branding -> Back must return to About first,
# while About -> Back still returns to the originating app screen.
ok('href="license.html"' in about_text and 'href="branding.html"' in about_text, 'About child-document links missing')

# v1.7.0 visualization regression checks
ok('class="fastRing" id="fastProgressTrack"' in index and "--fast-progress-angle" in index, 'circular fasting progress ring missing')
ok("fastProgressTrack.style.setProperty('--fast-progress-angle'" in index, 'progress ring is not driven by live fasting progress')
for ident in ['statsTimelineView','statsCalendarView','statsTrendView','statsWeeksView','fastCalendar','fastTrendChart','fastWeeksChart']:
    ok(f'id="{ident}"' in index, f'missing statistics visualization element {ident}')
ok('data-viz="timeline"' in index and 'data-viz="calendar"' in index and 'data-viz="trend"' in index and 'data-viz="weeks"' in index, 'statistics visualization switcher incomplete')
ok('function renderFastCalendar()' in index and 'function drawFastTrendChart()' in index and 'function drawFastWeeksChart()' in index, 'statistics visualization renderers missing')
ok("el('fastTrendChart').addEventListener('pointerdown', handleTrendPointer)" in index and "el('fastWeeksChart').addEventListener('pointerdown', handleWeeksPointer)" in index, 'trend/week chart interactions missing')
ok("el('calendarPrevBtn').addEventListener('click'" in index and "el('calendarNextBtn').addEventListener('click'" in index, 'calendar month navigation missing')

# Execute the actual v1 compatibility/validation functions against data shapes that
# previously could cause a false Recovery mode. Core timestamp corruption must still fail.
try:
    compat_names=['normalizeLanguage','normalizeAppearance','normalizeIconChoice','validDate','numberSymbols','parseLocalizedNumber','currentTimeZone','isValidTimeZone','normalizeTimeZone','makeId','sanitizeGoal','sanitizeWeightKg','normalizeWeightUnit','normalizeWeightEntry','migrateData','normalizeRecord','normalizeData','prepareCompatibleData','validateImportedData','validateCompatibleData']
    compat_funcs='\n'.join(extract_func(n) for n in compat_names)
    compat_test=r'''
const DATA_VERSION=1, SUPPORTED_LANGUAGES=['en','bg','es'];
const FUTURE_TOLERANCE_MS=60*1000, MAX_SAFE_GOAL_HOURS=2_000_000_000;
const MAX_IMPORT_FASTS=10000, MAX_IMPORT_WEIGHTS=10000;
function currentLocale(){return 'en-US'}
'''+compat_funcs+r'''
function assert(c,m){if(!c)throw new Error(m)}
const legacy={dataVersion:'1',revision:'bad',updatedAt:'not-a-date',goalHours:'16',activeStart:null,activeGoalHours:16,activeTimeZone:'Bad/Zone',records:[{id:'dup',start:'2026-09-25T06:00:00Z',end:'2026-09-25T22:00:00Z',goalHours:null,timeZone:''},{id:'dup',start:'2026-09-25T20:00:00Z',end:'2026-09-26T12:00:00Z',goalHours:'16',timeZone:'Bad/Zone'}],weights:[{id:'dupw',when:'2026-09-25T08:00:00Z',kg:'80,5',timeZone:''},{id:'dupw',when:'2026-09-26T08:00:00Z',kg:80.2,timeZone:'Bad/Zone'}],weightUnit:'stones',targetWeightKg:'n/a',gamificationEnabled:'yes',language:123,appearance:'auto',iconChoice:'default'};
const result=validateCompatibleData(legacy),d=result.data;
assert(result.changed,'repairable legacy data must be changed');
assert(d.dataVersion===1 && d.revision===0 && d.updatedAt===null,'machine metadata repair');
assert(d.appearance==='system' && d.iconChoice==='plate' && d.language==='system','preference repair');
assert(d.activeStart===null && d.activeGoalHours===null && d.activeTimeZone===null,'orphan active metadata repair');
assert(new Set(d.records.map(x=>x.id)).size===2 && d.records.length===2,'duplicate IDs repaired and overlap preserved');
assert(new Set(d.weights.map(x=>x.id)).size===2 && d.weights[0].kg===80.5,'weight metadata repair');
let failed=false;try{validateCompatibleData({...d,records:[{...d.records[0],start:'not-a-date'}]})}catch(e){failed=String(e.message).includes('invalid fasting record')}
assert(failed,'damaged core timestamp must remain a Recovery-level error');
console.log('compatibility repair regression tests passed');
'''
    with tempfile.NamedTemporaryFile('w',suffix='.js',delete=False,encoding='utf-8') as f:
        f.write(compat_test); compat_file=f.name
    cp=subprocess.run(['node',compat_file],capture_output=True,text=True)
    ok(cp.returncode==0,'compatibility repair regression tests failed: '+cp.stderr)
except Exception as e:
    errors.append('could not build compatibility repair tests: '+str(e))

if errors:
    print('FAIL')
    for e in errors: print(' -',e)
    sys.exit(1)


# v1.7.2 iPhone/PWA touch + dual-axis regression checks
ok('grid-template-columns:repeat(2,minmax(0,1fr))' in index, 'visualization tabs are not enlarged to two rows')
ok('min-height:58px' in index, 'visualization tabs do not have enlarged mobile touch targets')
ok("button.addEventListener('touchstart', handleStatsVizTouchStart, {passive:false});" in index, 'visualization tabs lack immediate touch-start activation')
ok("el('timelineScroller').addEventListener('touchend', finishTimelineTouch, {passive:false});" in index, 'timeline lacks touch-end selection')
ok("el('chart').addEventListener('click', handleChartClick);" in index, 'timeline lacks click fallback')
ok('const instant = day.startMs + fraction * (day.endMs - day.startMs);' in index, 'timeline does not use coordinate-based segment hit testing')
ok('.timelineScroller #chart { min-width:700px' in index, 'timeline is not widened for touch selection')
ok('timelineAxisLeft' in index and 'timelineAxisRight' in index, 'timeline must show time axes on both sides')

print('PASS: release, integrity, localization, DOM, storage/privacy, backup-pressure and algorithm regression checks')
