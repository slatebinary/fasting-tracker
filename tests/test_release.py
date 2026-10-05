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
en_source=json.loads((ROOT/'i18n'/'en.json').read_text(encoding='utf-8'))
sw=(ROOT/'sw.js').read_text()
ver=json.loads((ROOT/'version.json').read_text())
ok(ver.get('version')=='1.9.2','version must be 1.9.2')
ok(ver.get('released')=='2026-10-05','release date must be 2026-10-05')
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
ok('validateCompatibleData(JSON.parse(legacyRaw)).data' in index and 'return { data: validateImportedData(prepared.data), changed: prepared.changed };' in index,'legacy/live compatibility bridge must end in strict validation')
ok('const payload = await loadSnapshotPayload(snapshotId);' in index and 'const restored = validateCompatibleData(payload).data;' in index,'recovery snapshot restore is not compatibility-validated')
ok('navigator.storage.persisted' in index and 'storageProtectionStatus' in index,'storage protection UI missing')
ok('installStorageNotice' in index and 'isStandaloneApp' in index,'Safari/Home Screen storage warning missing')
ok(en_source.get('backup.noneYet')=='No external backup yet','missing first-backup empty-state label')
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
# Translation parity from external source dictionaries.
lang_dicts={}
for lang in ('en','bg','es'):
    jp=ROOT/'i18n'/f'{lang}.json'; rp=ROOT/'i18n'/f'{lang}.js'
    ok(jp.is_file(),f'missing i18n source {lang}.json')
    ok(rp.is_file(),f'missing i18n runtime {lang}.js')
    if jp.is_file(): lang_dicts[lang]=json.loads(jp.read_text(encoding='utf-8'))
langs={lang:set(values) for lang,values in lang_dicts.items()}
ok(langs.get('en')==langs.get('bg')==langs.get('es'),f'translation key mismatch: {[len(langs.get(x,set())) for x in ["en","bg","es"]]}')
refs_i18n=set(re.findall(r'data-i18n(?:-html|-aria)?="([^"]+)"',index)) | set(re.findall(r"\bt\('([^']+)'",main or ''))
missing_i18n=sorted(refs_i18n-langs.get('en',set()))
ok(not missing_i18n,'missing translation keys: '+','.join(missing_i18n[:20]))
# Runtime bundles must be generated from, and exactly match, their JSON sources.
try:
    ph=lambda value:set(re.findall(r'\{([A-Za-z0-9_]+)\}',str(value)))
    canonical=lang_dicts['en']
    for key,value in canonical.items():
        for lang in ('bg','es'):
            ok(ph(lang_dicts[lang][key])==ph(value), f'placeholder mismatch {lang}:{key}')
    plural_bases=['backup.snapshotWord','fasting.fastCount','import.fast','import.weight','unit.day','unit.hour']
    plural_categories=['zero','one','two','few','many','other']
    for base in plural_bases:
        for cat in plural_categories:
            for lang in ('en','bg','es'):
                ok(f'{base}.{cat}' in lang_dicts[lang], f'missing plural category {lang}:{base}.{cat}')
    for lang in ('en','bg','es'):
        runtime=(ROOT/'i18n'/f'{lang}.js').read_text(encoding='utf-8')
        with tempfile.NamedTemporaryFile('w',suffix='.js',delete=False,encoding='utf-8') as f:
            f.write(runtime+f"\nconsole.log(JSON.stringify(window.FT_I18N[{json.dumps(lang)}]));\n".replace('window.','globalThis.')); runtime_js=f.name
        # Browser bundles refer to window; evaluate with a tiny shim.
        js='globalThis.window=globalThis;\n'+runtime+f"\nconsole.log(JSON.stringify(window.FT_I18N[{json.dumps(lang)}]));\n"
        with tempfile.NamedTemporaryFile('w',suffix='.js',delete=False,encoding='utf-8') as f:
            f.write(js); runtime_js=f.name
        evaluated=json.loads(subprocess.check_output(['node',runtime_js],text=True))
        ok(evaluated==lang_dicts[lang],f'i18n runtime is stale for {lang}; run tools/build_i18n_runtime.py')
    source=json.loads((ROOT/'i18n-source.json').read_text())
    ok(source.get('sourceRevision')==20, 'i18n source revision mismatch')
    ok(source.get('appVersion')=='1.9.2', 'i18n source app version mismatch')
    ok(source.get('language')=='en', 'i18n source language must be en')
    ok(source.get('strings')==canonical, 'i18n-source.json is stale; run tools/export_i18n_source.py')
except Exception as e:
    errors.append('could not validate external translation dictionaries: '+str(e))
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
    node_test='const MAX_DATE_MS=8.64e15;\nconst numberSymbolsCache=new Map(); const timeZoneValidityCache=new Map(); const zonedFormatterCache=new Map();\n'+extracted+r'''
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
ok('backdate.errOverlap' in en_source and 'fasting.startEarlier' in en_source,'backdated active-fast localization missing')
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

ok('help.installAndroid' in en_source and 'help.installIOS' in en_source, 'separate iOS/Android installation localization missing')
for mf in ['manifest.webmanifest','manifest-bg.webmanifest','manifest-es.webmanifest','manifest-moon.webmanifest','manifest-hourglass.webmanifest','manifest-timer.webmanifest']:
    mm=json.loads((ROOT/mf).read_text())
    ok(any(i.get('purpose')=='maskable' for i in mm.get('icons',[])), f'maskable Android icon missing in {mf}')

# Rolling internal snapshot + one-tap reminder regression checks
ok('SNAPSHOT_RECENT_KEEP = 5' in index and 'SNAPSHOT_DAILY_KEEP = 7' in index and 'SNAPSHOT_WEEKLY_KEEP = 4' in index and 'SNAPSHOT_MONTHLY_KEEP = 6' in index, 'rolling snapshot retention constants missing')
ok('function pruneSnapshots(' in index and 'function maybeCreateRollingSnapshot(' in index, 'rolling snapshot logic missing')
ok("scheduleRollingSnapshot('automatic change')" in index and "maybeCreateRollingSnapshot('automatic change')" in index, 'automatic snapshot scheduling missing')
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

# IndexedDB lifetime-storage and recovery-snapshot regression checks
ok("const IDB_NAME = 'FastingTrackerDB';" in index and "indexedDB.open(IDB_NAME, IDB_VERSION)" in index, 'IndexedDB primary storage layer missing')
ok("createObjectStore('state'" in index and "createObjectStore('snapshotMeta'" in index and "createObjectStore('snapshotPayload'" in index, 'IndexedDB stores missing')
ok("localStorage.removeItem(DATA_KEY)" in index and "localStorage.removeItem(SNAPSHOT_KEY)" in index, 'legacy large localStorage payloads are not removed after migration')
ok("const PREFS_KEY = 'fastingTracker.preferences';" in index and 'function persistSmallPreferences()' in index, 'small localStorage preferences layer missing')
ok('function persistDailyTotals(' in index and 'function updateStoredDayTotalsIncrementally()' in index, 'incremental persisted daily fasting totals missing')
ok('MAX_IMPORT_FASTS = 100000' in index and 'MAX_IMPORT_DELETED_FASTS = 100000' in index and 'MAX_IMPORT_WEIGHTS = 100000' in index, 'lifetime record limits were not raised')
ok('function createInternalSnapshotAsync(' in index and "idbPut('snapshotPayload'" in index, 'IndexedDB recovery snapshot payload storage missing')
ok("'backup.autoSnapshotFailed'" in index and "'backup.autoSnapshotReduced'" in index, 'snapshot failure/reduced localization missing')
ok('backupReminderTitle' in index and "banner.classList.toggle('warn', snapshotAttention)" in index, 'persistent one-tap snapshot warning banner missing')
ok(any('One is created automatically after the first meaningful fasting or weight change.' in str(v) for v in en_source.values()), 'outdated recovery-snapshot empty-state wording remains')
ok('v1.0.0 — FIRST DEPLOYMENT' not in (ROOT/'FIRST-DEPLOYMENT-CHECKLIST.txt').read_text(), 'deployment checklist still tied to v1.0.0')
ok('1.0.0 -> 1.0.1' not in (ROOT/'RELEASE-GUIDE.txt').read_text(), 'release guide still contains obsolete release example')


# Internationalization-readiness regression checks
ok('const I18N_SOURCE_REVISION = 20;' in index, 'canonical i18n source revision missing')
ok('const LANGUAGE_META = Object.freeze({' in index and 'const SUPPORTED_LANGUAGES' in index, 'central language metadata missing')
ok('new Intl.PluralRules(currentLocale()).select' in index, 'Intl.PluralRules pluralization missing')
ok('function resolveSystemLanguage()' in index and 'navigator.languages' in index, 'system-language resolution is not future-ready')
ok("document.documentElement.dir = meta.dir" in index, 'app direction is not driven by language metadata')
ok('padding-inline-start' in index and 'margin-inline-start' in index and 'text-align: end' in index, 'logical CSS properties for RTL readiness missing')
ok('I18N-GUIDE.md' in [p.name for p in ROOT.iterdir()], 'I18N-GUIDE.md missing')
ok((ROOT/'i18n-source.json').is_file() and (ROOT/'tools/export_i18n_source.py').is_file() and (ROOT/'tools/build_i18n_runtime.py').is_file(), 'canonical i18n source/build tools missing')
ok('const I18N = window.FT_I18N || {};' in index, 'main app does not use external translation runtime')
ok(all(f'<script src="i18n/{lang}.js"></script>' in index for lang in ('en','bg','es')), 'external translation runtime scripts missing')
ok("if (rawData.language != null && typeof rawData.language !== 'string')" in index, 'future-language backup tolerance missing')
ok("if (!['system','en','bg','es'].includes(rawData.language))" not in index, 'backup import still rejects future language codes')
ok("manifestSuffix" in index and 'function manifestFor(lang, icon)' in index, 'manifest selection is not metadata-driven')
ok("sel.replaceChildren()" in index and 'LANGUAGE_META[code].label' in index, 'language selector options are not metadata-driven')
ok('lang === \'bg\' ?' not in index and "lang === 'es' ?" not in index, 'hard-coded language ternary remains in app logic')
# User-visible dynamic messages must use t(...) rather than direct alert/confirm/prompt literals.
main_src=main or ''
ok(not re.search(r"\b(?:alert|confirm|prompt)\(\s*['\"]", main_src), 'hard-coded alert/confirm/prompt user text remains')
# Existing translations are validated from external JSON sources above.
ok(len(langs.get('en',set())) >= 300, 'unexpectedly small canonical translation dictionary')
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
ok("event.key === BACKUP_META_KEY" in index and "event.key === DATA_REVISION_SIGNAL_KEY" in index, 'backup/data cross-tab synchronization missing')
ok('function reloadBackupMetaFromStorage()' in index, 'backup metadata reload helper missing')
ok('function numberSymbols(' in index and 'formatToParts(12345.6)' in index, 'locale-aware number symbols missing')
ok('const MAX_DATE_MS = 8.64e15;' in index and 'function safeTargetDate(' in index, 'extreme target-date guard missing')
ok('parsed > MAX_SAFE_GOAL_HOURS' in index, 'extreme goal input is not rejected')
ok('function normalizeBackupClockSkew()' in index and "['firstDataAt','lastExternalBackupAt']" in index, 'backup reminder clock-skew hardening missing')

# v1.6.1 recovery/navigation regressions
ok('function prepareCompatibleData(rawData)' in index and "normalizeAppearance(candidate.appearance)" in index and "typeof candidate.gamificationEnabled !== 'boolean'" in index and "usedFastIds" in index, 'legacy v1 compatibility repair missing')
ok('async function initializePersistentStorage()' in index and 'validateCompatibleData(JSON.parse(legacyRaw)).data' in index and 'await persistPrimaryNow(data)' in index, 'legacy compatible data is not migrated into IndexedDB')
ok('const APP_SCREENS' in index and 'activateScreen(location.hash.slice(1), { updateHash: false });' in index, 'return-to-tab routing missing')
ok('target="_blank" rel="noopener" data-i18n="public.privacy"' not in index and 'privacy.html?return=settings' in index, 'Settings privacy link must stay in app context and remember Settings')
ok('about.html?return=fasting#health' in index and 'about.html?return=settings' in index, 'About links do not preserve their originating app screen')
for rel in ['about.html','privacy.html','branding.html','license.html']:
    txt=(ROOT/rel).read_text()
    ok("u.searchParams.set('return',returnScreen)" in txt and "u.hash=returnScreen==='fasting'?'':returnScreen" in txt, f'{rel} does not preserve return screen')

# v1.6.3 startup initialization-order regression
# load() normalizes legacy/localized numeric fields and can call currentLocale() ->
# uiLanguage(). Ensure all lexical bindings read by that path are initialized first.
boot_load = index.index('await initializePersistentStorage();')
ok(index.index('let data = cloneDefault();') < boot_load, 'data must be initialized before IndexedDB load')
ok(index.index('let urlLangOverride =') < boot_load, 'urlLangOverride must be initialized before IndexedDB load')
ok(index.index('let urlIconOverride =') < boot_load, 'urlIconOverride must be initialized before IndexedDB load')
ok(index.index('let emergencyBoot =') < boot_load, 'emergencyBoot must be initialized before IndexedDB load')

# v1.6.2 recovery hardening + exact documentation return regressions
ok("const DOC_RETURN_KEY = 'fastingTracker.documentReturnUrl';" in index and 'sessionStorage.setItem(DOC_RETURN_KEY, location.href)' in index, 'exact documentation return capture missing')
ok('data.records.length > MAX_IMPORT_FASTS' in index and 'data.deletedFasts.length > MAX_IMPORT_DELETED_FASTS' in index and 'data.weights.length > MAX_IMPORT_WEIGHTS' in index and 'queuePrimaryPersistence()' in index, 'save must enforce lifetime record limits and queue IndexedDB persistence')
ok('async function reloadFromIndexedDB' in index and 'loadRecordBasedData()' in index and 'DATA_REVISION_SIGNAL_KEY' in index, 'cross-context storage sync must reload record-based IndexedDB state')
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
    compat_names=['pad','normalizeLanguage','normalizeAppearance','normalizeIconChoice','validDate','numberSymbols','parseLocalizedNumber','currentTimeZone','isValidTimeZone','normalizeTimeZone','zonedParts','dayKey','dayKeyFast','normalizeAuditTimestamp','makeId','sanitizeGoal','sanitizeWeightKg','normalizeWeightUnit','normalizeWeightEntry','normalizeDeletedWeight','normalizeFastEditAuditEntry','normalizeFastEditHistory','migrateData','normalizeRecord','normalizeDeletedFast','normalizeNotificationPreferences','normalizeData','prepareCompatibleData','validateImportedData','validateCompatibleData']
    compat_funcs='\n'.join(extract_func(n) for n in compat_names)
    compat_test=r'''
const DATA_VERSION=1, SUPPORTED_LANGUAGES=['en','bg','es'];
const FUTURE_TOLERANCE_MS=60*1000, MAX_SAFE_GOAL_HOURS=2_000_000_000;
const MAX_IMPORT_FASTS=100000, MAX_IMPORT_DELETED_FASTS=100000, MAX_IMPORT_WEIGHTS=100000, MAX_FAST_EDIT_AUDIT=100;
const numberSymbolsCache=new Map(), timeZoneValidityCache=new Map(), zonedFormatterCache=new Map();
function currentLocale(){return 'en-US'}
'''+compat_funcs+r'''
function assert(c,m){if(!c)throw new Error(m)}
const legacy={dataVersion:'1',revision:'bad',updatedAt:'not-a-date',goalHours:'16',activeStart:null,activeGoalHours:16,activeTimeZone:'Bad/Zone',records:[{id:'dup',start:'2026-09-25T06:00:00Z',end:'2026-09-25T22:00:00Z',goalHours:null,timeZone:''},{id:'dup',start:'2026-09-25T20:00:00Z',end:'2026-09-26T12:00:00Z',goalHours:'16',timeZone:'Bad/Zone'}],weights:[{id:'dupw',when:'2026-09-25T08:00:00Z',kg:'80,5',timeZone:''},{id:'dupw',when:'2026-09-26T08:00:00Z',kg:80.2,timeZone:'Bad/Zone'}],weightUnit:'stones',targetWeightKg:'n/a',gamificationEnabled:'yes',language:123,appearance:'auto',iconChoice:'default'};
const result=validateCompatibleData(legacy),d=result.data;
assert(result.changed,'repairable legacy data must be changed');
assert(d.dataVersion===1 && d.revision===0 && d.updatedAt===null,'machine metadata repair');
assert(d.appearance==='system' && d.iconChoice==='plate' && d.language==='system','preference repair');
assert(d.notificationPreferences && d.notificationPreferences.enabled===false && d.notificationPreferences.targetReached===true && d.notificationPreferences.backupDue===true && d.notificationPreferences.longFastSafety===true && d.notificationPreferences.weighIn===false && d.notificationPreferences.weighInCadence==='weekly' && d.notificationPreferences.cycleComplete===false,'notification preference defaults repair');
assert(d.activeStart===null && d.activeGoalHours===null && d.activeTimeZone===null && d.activeCreatedAt===null && d.activeModifiedAt===null,'orphan active metadata repair');
assert(new Set(d.records.map(x=>x.id)).size===2 && d.records.length===2,'duplicate IDs repaired and overlap preserved');
assert(Array.isArray(d.deletedFasts) && d.deletedFasts.length===0,'legacy data must gain an empty deleted-fast audit array');
assert(Array.isArray(d.deletedWeights) && d.deletedWeights.length===0,'legacy data must gain an empty deleted-weight audit array');
assert(new Set(d.weights.map(x=>x.id)).size===2 && d.weights[0].kg===80.5,'weight metadata repair');
assert(d.records.every(x=>x.createdAt===null && x.modifiedAt===null),'legacy fast audit times must remain unknown');
assert(d.weights.every(x=>x.createdAt===null && x.modifiedAt===null),'legacy weight audit times must remain unknown');
const audit='2026-09-30T08:00:00.000Z';
const stamped=validateCompatibleData({...d,records:[{...d.records[0],createdAt:audit,modifiedAt:audit}],weights:[{...d.weights[0],createdAt:audit,modifiedAt:audit}]}).data;
assert(stamped.records[0].createdAt===audit && stamped.records[0].modifiedAt===audit,'fast audit timestamps must survive validation');
assert(stamped.weights[0].createdAt===audit && stamped.weights[0].modifiedAt===audit,'weight audit timestamps must survive validation');
const repaired=validateCompatibleData({...d,records:[{...d.records[0],createdAt:'bad',modifiedAt:'bad'}],weights:[{...d.weights[0],createdAt:'bad',modifiedAt:'bad'}]}).data;
assert(repaired.records[0].createdAt===null && repaired.records[0].modifiedAt===null,'invalid optional fast audit metadata should repair to unknown');
assert(repaired.weights[0].createdAt===null && repaired.weights[0].modifiedAt===null,'invalid optional weight audit metadata should repair to unknown');
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


# v1.7.3 Timeline geometry, selection, and touch-response regression checks
ok('grid-template-columns:repeat(2,minmax(0,1fr))' in index, 'visualization tabs are not enlarged to two rows')
ok('min-height:58px' in index, 'visualization tabs do not have enlarged mobile touch targets')
ok('.timelineScroller #chart { min-width:700px; width:100%; height:310px; touch-action:pan-x; }' in index, 'timeline CSS height must match its 310px chart geometry')
ok('const cssW = c.clientWidth || 700, cssH = c.clientHeight || 310;' in index, 'timeline must use measured CSS height for proportional drawing/hit-testing')
ok('padding:13px 4px 33px' in index, 'dual time axes are not aligned with the timeline plot area')
ok("el('chart').addEventListener('pointerdown', beginTimelinePointer);" in index, 'timeline lacks Pointer Events input')
ok("el('chart').addEventListener('pointerup', finishTimelinePointer);" in index, 'timeline lacks prompt pointer-up selection')
ok("el('statsVizSwitcher').addEventListener('pointerdown', handleStatsVizPointerDown);" in index, 'visualization tabs lack delegated Pointer Events activation')
ok('requestAnimationFrame(() => {' in index and 'statsVizRenderTimer = setTimeout(() => {' in index, 'visualization tab rendering is not deferred until after an immediate paint')
ok('ctx.strokeStyle = textColor; ctx.lineWidth = 4' in index, 'selected timeline segment lacks strong high-contrast border')
ok('timelineAxisLeft' in index and 'timelineAxisRight' in index, 'timeline must show time axes on both sides')
ok('const instant = day.startMs + fraction * (day.endMs - day.startMs);' in index, 'timeline does not map the full vertical day to a selectable instant')

if errors:
    print('FAIL')
    for e in errors: print(' -',e)
    sys.exit(1)

# v1.7.4 statistics visualization responsiveness + selection contrast regression checks
ok("statsVizSwitcher').addEventListener('pointerdown', handleStatsVizPointerDown)" in index and "addEventListener('touchstart'" not in index, 'stats switcher must use unified immediate Pointer Events')
ok('setTimeout(() => {' in index and 'renderStatsVisualizationMode(requestedMode)' in index, 'stats view render must be deferred until after the selection can paint')
ok('const statsVizRendered = new Set();' in index, 'statistics visualization render cache missing')
ok('.calendarDay.selected { outline:3px solid #fff' in index, 'calendar selection needs high-contrast white border')
ok("ctx.fillStyle=selected?'#ffffff':accent" in index, 'trend selection needs a white selected dot')
ok("ctx.strokeStyle='#ffffff';ctx.lineWidth=4" in index, 'weekly selection needs a high-contrast white border')


# v1.7.6 fasting-target preset regression checks
ok('data-goal="22"' in index, '22-hour quick fasting target preset is missing')
ok('data-goal="23"' in index, '23-hour quick fasting target preset is missing')



# v1.7.7 responsive Weight actions regression checks
ok('function bindResponsiveAction(node, handler)' in index, 'responsive touch activation helper missing')
ok('function save({ deferSnapshot = true' in index, 'automatic snapshot rotation must be deferred by default')
ok('function scheduleWeightUiRefresh()' in index, 'lightweight Weight refresh scheduler missing')
ok("bindResponsiveAction(el('weightSaveBtn'), saveWeightEntry);" in index, 'Weight Save does not use responsive activation')
ok('bindResponsiveAction(edit, () => openWeightModal(w));' in index, 'Weight Edit does not use responsive activation')
ok('bindResponsiveAction(del, () => {' in index, 'Weight Delete does not use responsive activation')
ok("requestIdleCallback' in window" in index, 'deferred snapshot work should prefer browser idle time')

if errors:
    print('FAIL')
    for e in errors: print(' -',e)
    sys.exit(1)

# v1.7.8 per-entry audit metadata + single-file share regression checks
ok('activeCreatedAt: null' in index, 'active fast creation audit field missing from canonical data')
ok('createdAt: normalizeAuditTimestamp(r.createdAt)' in index and 'modifiedAt: normalizeAuditTimestamp(r.modifiedAt)' in index, 'fasting record audit fields are not normalized')
ok('createdAt: normalizeAuditTimestamp(w.createdAt)' in index and 'modifiedAt: normalizeAuditTimestamp(w.modifiedAt)' in index, 'weight record audit fields are not normalized')
ok('data.activeCreatedAt = createdAt;' in index and 'createdAt: activeSnapshot.activeCreatedAt' in index and 'modifiedAt: activeSnapshot.activeModifiedAt' in index, 'active fast creation/modification audit times are not carried into its completed record')
ok('createdAt: existingRecord ? normalizeAuditTimestamp(existingRecord.createdAt) : nowAudit' in index and 'modifiedAt: existingRecord ? nowAudit : null' in index, 'manual fasting audit timestamps missing')
ok('createdAt: existingWeight ? normalizeAuditTimestamp(existingWeight.createdAt) : nowAudit' in index and 'modifiedAt: existingWeight ? nowAudit : null' in index, 'weight audit timestamps missing')
ok("navigator.share({ files: [file] })" in index and "navigator.share({files:[file]})" in index, 'backup/recovery share must send only the JSON file')
ok("title: t('backup.shareTitle')" not in index and "title:t('backup.shareTitle')" not in index, 'share title can create an unwanted companion text item on iOS/cloud targets')


# v1.9.2 completed-fast edit audit regression checks
ok('function substantialFastEdit(previous, next)' in index, 'completed-fast material-change confirmation logic missing')
ok('editHistory: normalizeFastEditHistory(r.editHistory)' in index, 'completed-fast edit audit history is not normalized')
ok('fastEditAuditEntry(existingRecord, nowAudit)' in index, 'completed-fast previous values are not retained before edit')
ok("t('history.editedAt'" in index, 'edited completed fasts are not visibly marked in History')
ok('entryAuditHelp' in index and 'history.editMaterialConfirm' in en_source, 'completed-fast edit audit/confirmation UI missing')

# v1.9.2 fasting-cycle preset/countdown regression checks
ok('data-goal="12"' in index and 'data-goal="14"' in index and 'data-goal="20"' in index, '12h/14h/20h settings presets missing')
ok('data-active-goal="12"' in index and 'data-active-goal="14"' in index and 'data-active-goal="20"' in index, '12h/14h/20h active-target presets missing')
ok('id="nextFastCard"' in index and 'function nextFastCycleInfo' in index and 'durationMs >= dayMs' in index, 'next-fast countdown implementation missing')
ok('data.goalHours = activeSnapshot.activeGoalHours;' in index, 'last used target is not carried forward as next default')
ok((ROOT/'tests'/'test_fasting_cycle.py').is_file(), 'fasting-cycle browser regression test missing')

if errors:
    print('FAIL')
    for e in errors: print(' -',e)
    sys.exit(1)



ok('activeModifiedAt: null' in index, 'active fast modification audit field missing from canonical data')
ok("data.activeModifiedAt = new Date().toISOString();" in index, 'editing active fasting target does not stamp modification time')
ok('createdAt: activeSnapshot.activeCreatedAt' in index and 'modifiedAt: activeSnapshot.activeModifiedAt' in index, 'active fast modification time is not carried into completed record')
ok('id="editActiveTargetBtn"' in index and 'id="activeTargetModal"' in index, 'active target editing UI is missing')
ok("function requestActiveGoalChange(value)" in index and "function applyActiveGoalValue(value)" in index, 'active target editing logic is missing')

# v1.7.10 active-target edit and newest-first timeline regression checks
ok("let timelineScrollToLatestPending = true;" in index, 'timeline latest-position state missing')
ok("scroller.scrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);" in index, 'timeline does not align to newest/right edge')
ok("if (statsVizMode === 'timeline') timelineScrollToLatestPending = true;" in index, 'timeline mode does not request newest position on activation')
ok("if (target === 'stats' && statsVizMode === 'timeline') scrollTimelineToLatest();" in index, 'Stats activation does not restore newest timeline position')


# v1.8.4 stop-fast confirmation + Undo regression checks
ok('id="stopFastModal"' in index and 'id="stopAndSaveBtn"' in index and 'id="keepFastingBtn"' in index, 'single stop-fast modal is missing')
ok('id="stopUndoBar"' in index and 'id="stopUndoBtn"' in index, 'stop-fast Undo UI is missing')
ok('function undoStoppedFast()' in index and 'expiresAt: Date.now() + 10000' in index, '10-second stop-fast Undo logic is missing')
ok("confirm(t('fasting.stop" not in index, 'native/double stop-fast confirmation still remains')
ok('fasting.stopModalText' in en_source and 'fasting.stopAndSave' in en_source and 'fasting.undo' in en_source, 'stop-fast modal/Undo translations missing')


# v1.8.5 stop countdown / home return / weight chart interaction regression checks
ok('id="stopUndoCountdown"' in index and 'function updateStopUndoCountdown()' in index, 'visible stop-fast Undo countdown is missing')
ok("activateScreen('fasting');" in index and 'function keepFastingAndReturnHome()' in index, 'Keep fasting does not explicitly return to the Fasting home screen')
ok('weightChartHitPoints' in index and 'function weightChartPointAt(' in index and 'function finishWeightChartPointer(' in index, 'weight chart point interaction is missing')
ok('id="weightChartDetail"' in index and 'weight.aggregatePointDetail' in en_source, 'weight chart selected-value details are missing')

# v1.8.6 weight-period statistics regression checks
ok('id="weightPeriodSwitcher"' in index and all(f'data-weight-period="{mode}"' in index for mode in ['daily','week','month','quarter','halfyear','year']), 'daily/weekly/monthly/quarterly/6-month/yearly weight selector is incomplete')
ok(all(f'id="{metric}"' in index for metric in ['wPeriodStart','wPeriodEnd','wPeriodChange','wPeriodAverage','wPeriodLow','wPeriodHigh']), 'weight period summary metrics are incomplete')
ok('function weightPeriodBounds(' in index and 'function weightEntriesForPeriod(' in index and 'function renderWeightPeriodAnalytics(' in index, 'weight period statistics logic is missing')
ok('weight.statistics' in en_source and 'weight.periodQuarter' in en_source and 'weight.periodHalfYear' in en_source, 'weight period translations are missing')
ok((ROOT/'tests'/'test_weight_statistics.py').is_file(), 'weight-period browser regression test missing')


# v1.8.7 aggregated/scrollable weight timeline regression checks
ok('id="weightChartScroller"' in index and 'id="weightChartTrack"' in index and 'id="weightChartYAxis"' in index, 'scrollable weight chart shell is incomplete')
ok('function buildWeightAggregateBuckets(' in index and 'function weightBucketKeyForDay(' in index, 'calendar-period weight aggregation is missing')
ok('weightChartScrollToLatestPending = true' in index and 'scroller.scrollLeft=Math.max(0,scroller.scrollWidth-scroller.clientWidth)' in index, 'weight chart newest-first positioning is missing')
ok('function handleWeightChartScroll()' in index and "addEventListener('scroll', handleWeightChartScroll" in index, 'historical weight chart scrolling is missing')
ok('weight.aggregatePointDetail' in en_source and 'weight.weekOf' in en_source, 'aggregate weight point localization is missing')
ok((ROOT/'tests'/'test_weight_aggregation_scroll.py').is_file(), 'weight aggregation/scroll browser regression test missing')
ok("let weightPeriodMode = 'daily'" in index and 'weight.periodDaily' in en_source, 'Daily weight-chart mode/default is missing')
ok("if (mode === 'daily')" in index and 'key:`entry:${entry.id}`' in index, 'Daily mode must preserve individual weight entries rather than aggregate them')
ok('function weightPointCalloutPeriod(' in index and 'periodLabel=weightPointCalloutPeriod(bucket)' in index, 'selected weight points must label their exact time/calendar period')
ok("weightPeriodMode==='daily'?buckets:buckets.filter" in index and 'weightChartScaleCache' in index, 'lifetime-scale Daily rendering optimization is missing')

# v1.8.0+ performance/architecture regression checks
ok('function renderScreen(' in index and 'const viewDirty = {' in index, 'screen-level lazy rendering missing')
ok("document.querySelectorAll('.tab').forEach(tab => bindResponsiveAction" in index, 'bottom navigation is not on unified Pointer Events action path')
ok("statsVizSwitcher').addEventListener('touchstart'" not in index, 'duplicate touchstart statistics path remains')
ok("addEventListener('touchstart'" not in index, 'legacy touchstart handlers remain; Pointer Events should be the single path')
ok('statsSummaryCache' in index and 'weeklySummariesCache' in index and 'calendarDaysCache' in index, 'derived statistics caching missing')
ok('function queueStorageProtectionRefresh()' in index and 'requestIdleCallback' in index, 'deferred storage-protection work missing')
ok((ROOT/'tests'/'test_performance.py').is_file(), 'performance regression test missing')
ok((ROOT/'tests'/'test_lifetime_performance.py').is_file(), '70-year lifetime performance regression test missing')
ok((ROOT/'tests'/'test_startup_snapshot.py').is_file(), 'startup snapshot regression test missing')

# v1.8.10 privacy-aware progress sharing regression checks
ok('id="shareProgressBtn"' in index and 'id="shareStatsBtn"' in index and 'id="shareModal"' in index, 'progress sharing entry points/modal missing')
ok('id="shareWeightToggle" type="checkbox"' in index and 'id="shareWeightToggle" type="checkbox" checked' not in index, 'weight sharing must exist but remain off by default')
ok('function buildShareProgressPayload()' in index and 'function shareProgress()' in index and 'function copyShareProgress()' in index, 'share composition/native share/copy fallback logic missing')
ok("navigator.share({title:payload.title, text:payload.body, url:payload.url})" in index, 'native progress share must include the installation URL')
ok("share.installLine" in en_source and "share.weightOptionHelp" in en_source, 'progress sharing localization missing')
ok('Sharing progress' in privacy_text and 'Споделяне на напредъка' in privacy_text and 'Compartir progreso' in privacy_text, 'localized progress-sharing privacy disclosure missing')
ok((ROOT/'tests'/'test_share_progress.py').is_file(), 'progress-sharing browser regression test missing')


# v1.8.11+ fasting Timeline target-detail regression checks
ok('goalHours: sanitizeGoal(r.goalHours, data.goalHours)' in index and 'goalHours: sanitizeGoal(data.activeGoalHours, data.goalHours)' in index, 'fasting Timeline intervals must retain their saved target')
ok('stats.detailFastTarget' in en_source and 'stats.detailFastSplitTarget' in en_source, 'fasting Timeline target-detail localization missing')
ok("t('stats.detailFastTarget'" in index and 'target: compactDuration(targetDuration)' in index, 'selected same-day fasting Timeline segment does not show duration versus target')
ok((ROOT/'tests'/'test_fasting_timeline_target_detail.py').is_file(), 'fasting Timeline target-detail browser regression test missing')

# v1.8.12+ fasting Timeline end-of-day axis regression checks
ok(index.count('<span>23:59</span>') >= 2, 'both fasting Timeline axes must end at 23:59')
ok('<span>24:00</span>' not in index, '24:00 must not remain on fasting Timeline axes')
ok("if (Math.abs(ms - dayEndMs) < 1000) return '23:59';" in index, 'Timeline clock-label helper must retain the 23:59 axis convention')



# v1.9.2 soft-delete/audit regression checks
ok('deletedFasts: []' in index and 'function normalizeDeletedFast(' in index, 'deleted-fast audit data model missing')
ok('deleted: true' in index and 'deletedAt:' in index and 'deletedTimeZone:' in index, 'deleted-fast audit metadata missing')
ok('function moveFastToDeleted(' in index and "deleteFastToAudit(r, 'user')" in index, 'History deletion is not soft-delete/audit based')
ok('id="deletedFastsCard"' in index and 'function restoreDeletedFast(' in index and 'function permanentlyDeleteFast(' in index, 'Recently deleted restore/permanent-delete UI missing')
ok('data.deletedFasts.length > 0' in index and 'JSON.stringify(data)' in index, 'deleted audit history must be backup-worthy and included in JSON data')
ok('deleted-fast audit record' in privacy_text.lower() and 'одитните записи за изтрити гладувания' in privacy_text.lower() and 'registros de auditoría de ayunos eliminados' in privacy_text.lower(), 'localized deleted-fast privacy disclosure missing')
ok((ROOT/'tests'/'test_soft_delete_audit.py').is_file(), 'soft-delete audit browser regression test missing')


# v1.9.2 cross-day continuation/detail regression checks
ok('stats.endOfDay' in en_source and 'stats.detailFastSplitTargetBeyond' in en_source, 'cross-day Timeline detail localization missing')
ok('function totalHoursDuration(ms)' in index and "t('stats.endOfDay')" in index, 'cross-day Timeline must use exact end-of-day wording and total-hour duration formatting')
ok('segment.continuationKey' in index and 'isRelatedContinuation' in index and 'ctx.setLineDash([4, 3])' in index, 'selected fast/gap continuation highlighting missing')
ok((ROOT/'tests'/'test_timeline_continuation_highlight.py').is_file(), 'Timeline continuation browser regression test missing')

# v1.9.2 optional device-notification regression checks
ok('id="notificationsCard"' in index and 'id="notificationMasterToggle"' in index and 'id="notificationTestBtn"' in index, 'notification settings UI missing')
ok('notificationPreferences:' in index and 'function normalizeNotificationPreferences(' in index, 'notification preferences data model missing')
ok("targetReached: true" in index and "backupDue: true" in index and "longFastSafety: true" in index and "weighIn: false" in index and "cycleComplete: false" in index, 'notification recommended defaults are incorrect')
ok('function maybeNotifyTargetReached(' in index and 'function maybeNotifyLongFastSafety(' in index and 'function maybeNotifyBackupDue(' in index and 'function maybeNotifyWeighIn(' in index and 'function maybeNotifyCycleComplete(' in index, 'notification trigger logic incomplete')
ok("Notification.requestPermission" in index and "registration.showNotification" in index, 'native notification permission/delivery path missing')
ok('Privacy-first limitation: this app has no push server.' in index and 'lock screen' in en_source['notifications.lockScreenPrivacy'].lower(), 'notification delivery/privacy disclosure missing')
ok("self.addEventListener('notificationclick'" in (ROOT/'sw.js').read_text(), 'service worker notification click routing missing')
ok('Notifications</h2>' in privacy_text and 'Известия</h2>' in privacy_text and 'Notificaciones</h2>' in privacy_text, 'localized notification privacy disclosure missing')
ok((ROOT/'tests'/'test_notifications.py').is_file(), 'notification browser regression test missing')

# v1.9.2 notification onboarding regression checks
ok('id="setupStepNotifications" data-setup-step="5"' in index and 'id="setupStepReady" data-setup-step="6"' in index, 'notification onboarding step/order missing')
ok('id="setupEnableNotificationsBtn"' in index and 'id="setupSkipNotificationsBtn"' in index, 'notification onboarding explicit actions missing')
ok('function enableSetupNotifications()' in index and 'Notification.requestPermission' in index and 'function skipSetupNotifications()' in index, 'notification onboarding explicit permission flow missing')
ok('next.hidden = setupGuideStep === 5' in index, 'generic setup Continue must not bypass notification choice UI')
ok('setup.notificationsIntro' in en_source and 'setup.readyNotifications' in en_source, 'notification onboarding localization missing')
ok((ROOT/'tests'/'test_setup_notifications.py').is_file(), 'notification-onboarding browser regression test missing')

# v1.9.2 weigh-in reminder cadence interaction regression checks
ok('id="notificationWeighDailyBtn"' in index and 'id="notificationWeighWeeklyBtn"' in index, 'Settings Daily/Weekly weigh-in cadence buttons missing')
ok('id="setupNotificationWeighDailyBtn"' in index and 'id="setupNotificationWeighWeeklyBtn"' in index, 'onboarding Daily/Weekly weigh-in cadence buttons missing')
ok('function renderWeighCadenceButtons(' in index and 'function setSettingsWeighCadence(' in index, 'weigh-in cadence interaction helpers missing')
ok("renderWeighCadenceButtons('notification', prefs.weighInCadence)" in index, 'Settings cadence control is not rendered from saved preference')
ok("renderWeighCadenceButtons('setupNotification', prefs.weighInCadence)" in index, 'onboarding cadence control is not rendered from saved preference')
ok("disabled=!prefs.weighIn" not in index and "disabled = !prefs.weighIn" not in index, 'cadence must remain selectable while weigh-in reminder is off')

if errors:
    print('FAIL')
    for e in errors: print(' -',e)
    sys.exit(1)

print('PASS: release, integrity, localization, DOM, storage/privacy, backup-pressure and algorithm regression checks')
