
  (function(){
    try {
      const allowed=['en','bg','es'];
      const params=new URLSearchParams(location.search);
      const q=params.get('lang');
      const qi=params.get('icon');
      let pref=null, storedData=null;
      try { storedData=JSON.parse(localStorage.getItem('fastingTracker.data')||'null'); pref=storedData&&storedData.language; if(storedData&&['light','dark'].includes(storedData.appearance)){ document.documentElement.dataset.theme=storedData.appearance; const theme=document.querySelector('meta[name=\"theme-color\"]'); if(theme) theme.content=storedData.appearance==='dark'?'#000000':'#ffffff'; } } catch {}
      const primarySystemTag=((Array.isArray(navigator.languages)&&navigator.languages[0])||navigator.language||'en').toLowerCase();
      const systemBase=primarySystemTag.split(/[-_]/,1)[0];
      const systemLang=allowed.includes(systemBase)?systemBase:'en';
      const lang=allowed.includes(q)?q:(allowed.includes(pref)?pref:systemLang);
      const iconAllowed=['plate','moon','hourglass','timer'];
      const icon=iconAllowed.includes(qi)?qi:(iconAllowed.includes(storedData&&storedData.iconChoice)?storedData.iconChoice:'plate');
      const manifestFor=(lng,ico)=>{
        if(ico==='plate') return lng==='bg'?'manifest-bg.webmanifest':lng==='es'?'manifest-es.webmanifest':'manifest.webmanifest';
        return `manifest-${ico}${lng==='bg'?'-bg':lng==='es'?'-es':''}.webmanifest`;
      };
      const titles={en:'Fasting',bg:'Гладуване',es:'Ayuno'};
      document.getElementById('appManifest').href=manifestFor(lang,icon);
      const fav=document.getElementById('appFavicon'); if(fav) fav.href=`icons/${icon}/favicon-32.png`;
      const touch=document.getElementById('appleTouchIcon'); if(touch) touch.href=`icons/${icon}/apple-touch-icon.png`;
      document.getElementById('appleAppTitle').content=titles[lang];
    } catch {}
  })();
  

  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Fasting Tracker",
    "applicationCategory": "HealthApplication",
    "operatingSystem": "iOS, Android, Web",
    "url": "{{ site.github.url }}/",
    "image": "{{ site.github.url }}/icons/plate/icon-512.png",
    "description": "Intermittent fasting and weight tracker with multi-day fasting, statistics, local backups and evidence-aware fasting science notes.",
    "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}
  }
  




(async () => {
  'use strict';

  const DATA_KEY = 'fastingTracker.data'; // legacy migration only
  const SNAPSHOT_KEY = 'fastingTracker.snapshots'; // legacy migration only
  const DATA_REVISION_SIGNAL_KEY = 'fastingTracker.dataRevision';
  const IDB_NAME = 'FastingTrackerDB';
  const IDB_VERSION = 1;
  const BACKUP_META_KEY = 'fastingTracker.backupMeta';
  const APP_META_KEY = 'fastingTracker.appMeta';
  const INSTALL_NOTICE_KEY = 'fastingTracker.installStorageNoticeDismissed';
  const LONG_FAST_NOTICE_KEY = 'fastingTracker.longFastNoticeSeen';
  const DOC_RETURN_KEY = 'fastingTracker.documentReturnUrl';
  const DATA_VERSION = 1;
  const BACKUP_FORMAT = 'fasting-tracker-backup';
  const BACKUP_VERSION = 1;
  // Increment only when canonical English source wording intentionally changes.
  const I18N_SOURCE_REVISION = 4;
  const LANGUAGE_META = Object.freeze({
    en: Object.freeze({ locale: 'en', dir: 'ltr', label: 'English', manifestSuffix: '', appTitle: 'Fasting' }),
    bg: Object.freeze({ locale: 'bg', dir: 'ltr', label: 'Български', manifestSuffix: '-bg', appTitle: 'Гладуване' }),
    es: Object.freeze({ locale: 'es', dir: 'ltr', label: 'Español', manifestSuffix: '-es', appTitle: 'Ayuno' })
  });
  const SUPPORTED_LANGUAGES = Object.freeze(Object.keys(LANGUAGE_META));
  const APP_VERSION = '1.8.0';
  const UPDATE_PROTOCOL_VERSION = 1;
  const FUTURE_TOLERANCE_MS = 60 * 1000;
  const SNAPSHOT_RECENT_KEEP = 5;
  const SNAPSHOT_DAILY_KEEP = 7;
  const SNAPSHOT_WEEKLY_KEEP = 4;
  const SNAPSHOT_MONTHLY_KEEP = 6;
  const SNAPSHOT_SCAN_LIMIT = 80;
  const BACKUP_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;
  const LONG_FAST_NOTICE_HOURS = 72;
  const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
  const MAX_IMPORT_FASTS = 100000;
  const MAX_IMPORT_WEIGHTS = 100000;
  const HISTORY_PAGE_SIZE = 50;
  const MAX_DATE_MS = 8.64e15;
  // Fixed conservative ceiling keeps target-date arithmetic inside ECMAScript Date's representable range.
  const MAX_SAFE_GOAL_HOURS = 2_000_000_000;
  const defaultData = { dataVersion: DATA_VERSION, revision: 0, updatedAt: null, goalHours: 16, activeStart: null, activeGoalHours: null, activeTimeZone: null, activeCreatedAt: null, activeModifiedAt: null, records: [], weights: [], weightUnit: 'kg', targetWeightKg: null, gamificationEnabled: true, language: 'system', appearance: 'system', iconChoice: 'plate' };
  const timeZoneValidityCache = new Map();
  const numberSymbolsCache = new Map();
  const zonedFormatterCache = new Map();
  // Initialize URL-dependent UI state and a safe default data object before loading
  // persisted data. Legacy-number normalization may ask currentLocale() ->
  // uiLanguage() during load(), so these bindings must never be in the TDZ.
  const initialUrlParams = new URLSearchParams(location.search);
  let emergencyBoot = initialUrlParams.get('ft_recovery') === '1';
  let urlLangOverride = SUPPORTED_LANGUAGES.includes(initialUrlParams.get('lang')) ? initialUrlParams.get('lang') : null;
  let urlIconOverride = ['plate','moon','hourglass','timer'].includes(initialUrlParams.get('icon')) ? initialUrlParams.get('icon') : null;
  let data = cloneDefault();
  let recoveryMode = null;
  let backupMeta = loadBackupMeta();
  let snapshotProtectionState = {
    status: ['ok','reduced','failed'].includes(backupMeta.snapshotProtectionStatus) ? backupMeta.snapshotProtectionStatus : 'ok',
    kept: Math.max(0, Number(backupMeta.snapshotStoredCount) || 0),
    desired: Math.max(0, Number(backupMeta.snapshotDesiredCount) || 0)
  };
  let automaticSnapshotFailureAlerted = false;
  let deferredSnapshotTicket = 0;
  let snapshotCache = [];
  let storedDayTotalsMap = new Map();
  let persistedRecordMap = new Map();
  let primaryPersistTicket = 0;
  let primaryPersistPromise = Promise.resolve();
  let appDbPromise = null;
  const versionTransitionSnapshotOK = await initializePersistentStorage();
  if (versionTransitionSnapshotOK && !recoveryMode) rememberCurrentAppVersion();

  const el = id => document.getElementById(id);
  const timer = el('timer');
  const friendlyTimer = el('friendlyTimer');
  const statusText = el('statusText');
  const toggleFast = el('toggleFast');
  const startEarlierBtn = el('startEarlierBtn');
  const editActiveTargetBtn = el('editActiveTargetBtn');
  const fastProgressTrack = el('fastProgressTrack');
  const progressDetail = el('progressDetail');
  const goalText = el('goalText');
  const goalHours = el('goalHours');
  let latestVersion = APP_VERSION;
  let updateAvailable = false;
  let updateInProgress = false;
  let backdateConflictRecords = [];
  let editingRecordId = null;
  let editingWeightId = null;
  let editingRecordTimeZone = null;
  let editingWeightTimeZone = null;
  let pendingLongFastGoal = null;
  let pendingLongFastScope = 'default';
  let lastModalFocus = null;
  let completedDayMapCache = null;
  let currentStreakCache = null;
  let historyVisibleCount = HISTORY_PAGE_SIZE;
  let weightVisibleCount = HISTORY_PAGE_SIZE;
  let fastActionLocked = false;
  let chartInteractiveLayout = [];
  let timelineChartGeometry = null;
  let timelineChartDays = [];
  let chartSelectedTarget = null;
  let statsVizMode = 'timeline';
  let statsCalendarMonthOffset = 0;
  let statsDetailOverride = null;
  let trendInteractiveLayout = [];
  let weekInteractiveLayout = [];
  let trendSelectedDayKey = null;
  let weekSelectedKey = null;
  let timelinePointerStart = null;
  let timelineScrollToLatestPending = true;
  let timelineScrollFrame = 0;
  let statsVizRenderFrame = 0;
  let statsVizRenderTimer = 0;
  const statsVizRendered = new Set();
  let trendChartDaysCache = null;
  let weeklySummariesCache = null;
  const calendarDaysCache = new Map();
  let statsSummaryCache = null;
  let currentZoneDaySummaryCache = null;
  const viewDirty = { fasting:true, history:true, weight:true, stats:true, settings:true };
  let lastAppliedLanguage = null;
  let lastAppliedAppearance = null;
  let lastAppliedIcon = null;
  let storageProtectionRefreshQueued = false;
  let statsVizPointerStamp = 0;
  const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');


  const I18N = window.FT_I18N || {};

  function baseLanguage(tag) { return String(tag || '').trim().toLowerCase().split(/[-_]/, 1)[0]; }
  function resolveSystemLanguage() {
    // Use only the host/device primary language. If it is unsupported, English is the default.
    const primary = (Array.isArray(navigator.languages) && navigator.languages[0]) || navigator.language || 'en';
    const base = baseLanguage(primary);
    return SUPPORTED_LANGUAGES.includes(base) ? base : 'en';
  }
  function normalizeLanguage(value) { return value === 'system' || SUPPORTED_LANGUAGES.includes(value) ? value : 'system'; }
  function normalizeAppearance(value) { return ['system','light','dark'].includes(value) ? value : 'system'; }
  function normalizeIconChoice(value) { return ['plate','moon','hourglass','timer'].includes(value) ? value : 'plate'; }
  function manifestFor(lang, icon) {
    icon = normalizeIconChoice(icon);
    lang = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'en';
    const suffix = LANGUAGE_META[lang].manifestSuffix;
    return icon === 'plate' ? `manifest${suffix}.webmanifest` : `manifest-${icon}${suffix}.webmanifest`;
  }
  function applyIconChoice() { const icon=normalizeIconChoice(urlIconOverride || data?.iconChoice); const lang=uiLanguage(); const manifest=el('appManifest'); if(manifest) manifest.href=manifestFor(lang,icon); const fav=el('appFavicon'); if(fav) fav.href=`icons/${icon}/favicon-32.png`; const touch=el('appleTouchIcon'); if(touch) touch.href=`icons/${icon}/apple-touch-icon.png`; document.querySelectorAll('.iconChoice[data-icon-choice]').forEach(btn=>{ const active=btn.dataset.iconChoice===icon; btn.classList.toggle('active',active); btn.setAttribute('aria-checked',active?'true':'false'); }); }
  function uiLanguage() {
    if (urlLangOverride) return urlLangOverride;
    const pref = normalizeLanguage(data?.language || 'system');
    return pref === 'system' ? resolveSystemLanguage() : pref;
  }
  function currentLocale() {
    const lang = uiLanguage();
    const browserLocale = String(navigator.language || '');
    // Preserve the user's regional conventions only when they match the UI language.
    // Choosing a language therefore does not silently choose a country or time zone.
    return baseLanguage(browserLocale) === lang ? browserLocale : LANGUAGE_META[lang].locale;
  }
  function t(key, vars = {}) {
    const lang = uiLanguage();
    let str = I18N[lang]?.[key] ?? I18N.en[key] ?? key;
    return String(str).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  }
  function pluralCategory(n) {
    try { return new Intl.PluralRules(currentLocale()).select(Number(n)); }
    catch { return Number(n) === 1 ? 'one' : 'other'; }
  }
  function pluralKey(base, n) {
    const category = pluralCategory(n);
    const candidate = `${base}.${category}`;
    if (I18N[uiLanguage()]?.[candidate] != null || I18N.en[candidate] != null) return candidate;
    return `${base}.other`;
  }
  function formatNumber(value, minimumFractionDigits = 0, maximumFractionDigits = 0) {
    return Number(value).toLocaleString(currentLocale(), { minimumFractionDigits, maximumFractionDigits });
  }
  function renderLanguageOptions() {
    const sel = document.getElementById('languageSelect');
    if (!sel) return;
    const selected = urlLangOverride || normalizeLanguage(data.language);
    sel.replaceChildren();
    const systemOption = document.createElement('option');
    systemOption.value = 'system';
    systemOption.textContent = t('settings.systemLanguage');
    sel.append(systemOption);
    for (const code of SUPPORTED_LANGUAGES) {
      const option = document.createElement('option');
      option.value = code;
      option.lang = code;
      option.dir = LANGUAGE_META[code].dir;
      option.textContent = LANGUAGE_META[code].label;
      sel.append(option);
    }
    sel.value = selected;
  }
  function applyLanguage() {
    const lang = uiLanguage();
    const meta = LANGUAGE_META[lang] || LANGUAGE_META.en;
    document.documentElement.lang = lang;
    document.documentElement.dir = meta.dir;
    try { localStorage.setItem('fastingTrackerPublicLang', lang); } catch {}
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(node => { node.innerHTML = t(node.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-aria]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAria)); });
    renderLanguageOptions();
    applyIconChoice();
    const appleTitle = document.getElementById('appleAppTitle');
    if (appleTitle) appleTitle.content = meta.appTitle;
    const goalUnit = document.getElementById('goalUnit');
    if (goalUnit) goalUnit.textContent = t('unit.h');
    document.querySelectorAll('.chip[data-goal]').forEach(chip => { chip.textContent = `${formatNumber(Number(chip.dataset.goal))}${t('unit.h')}`; });
    document.querySelectorAll('.chip[data-active-goal]').forEach(chip => { chip.textContent = `${formatNumber(Number(chip.dataset.activeGoal))}${t('unit.h')}`; });
  }

  function effectiveAppearance() {
    const pref = normalizeAppearance(data?.appearance || 'system');
    if (pref !== 'system') return pref;
    return systemThemeQuery.matches ? 'dark' : 'light';
  }
  function applyAppearance() {
    const pref = normalizeAppearance(data?.appearance || 'system');
    if (pref === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', pref);
    const sel = document.getElementById('appearanceSelect');
    if (sel) sel.value = pref;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = effectiveAppearance() === 'dark' ? '#000000' : '#ffffff';
  }

  function cloneDefault() { return JSON.parse(JSON.stringify(defaultData)); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function validDate(value) { if (value == null || value === '') return null; const d = new Date(value); return Number.isFinite(d.getTime()) ? d : null; }
  function numberSymbols(locale = currentLocale()) {
    const key = String(locale || 'en');
    if (numberSymbolsCache.has(key)) return numberSymbolsCache.get(key);
    let decimal = '.', group = ',';
    try {
      const parts = new Intl.NumberFormat(key).formatToParts(12345.6);
      decimal = parts.find(p => p.type === 'decimal')?.value || decimal;
      group = parts.find(p => p.type === 'group')?.value || group;
    } catch {}
    const symbols = { decimal, group };
    if (numberSymbolsCache.size > 32) numberSymbolsCache.clear();
    numberSymbolsCache.set(key, symbols);
    return symbols;
  }
  function parseLocalizedNumber(value, locale = currentLocale()) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let text = String(value ?? '').trim().replace(/\u2212/g, '-').replace(/[\s\u00A0\u202F]+/g, '');
    if (!text) return NaN;
    const { decimal: localeDecimal, group: localeGroup } = numberSymbols(locale);
    if (localeGroup && localeGroup !== ',' && localeGroup !== '.') text = text.split(localeGroup).join('');
    const commaCount = (text.match(/,/g) || []).length;
    const dotCount = (text.match(/\./g) || []).length;
    if (commaCount && dotCount) {
      const decimal = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
      const group = decimal === ',' ? '.' : ',';
      text = text.split(group).join('');
      if ((text.match(new RegExp(`\\${decimal}`, 'g')) || []).length !== 1) return NaN;
      if (decimal === ',') text = text.replace(',', '.');
    } else if (commaCount || dotCount) {
      const mark = commaCount ? ',' : '.';
      const count = commaCount || dotCount;
      if (count > 1) {
        const grouped = new RegExp(`^[+-]?\\d{1,3}(?:\\${mark}\\d{3})+$`);
        if (mark === localeGroup && grouped.test(text)) text = text.split(mark).join('');
        else return NaN;
      } else if (mark === localeDecimal) {
        if (mark === ',') text = text.replace(',', '.');
      } else if (mark === localeGroup) {
        const grouped = new RegExp(`^[+-]?\\d{1,3}\\${mark}\\d{3}$`);
        if (grouped.test(text)) text = text.replace(mark, '');
        else text = text.replace(mark, '.');
      } else {
        text = text.replace(mark, '.');
      }
    }
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return NaN;
    const n = Number(text);
    return Number.isFinite(n) ? n : NaN;
  }
  function safeTargetDate(startMs, targetMs) {
    const value = Number(startMs) + Number(targetMs);
    if (!Number.isFinite(value) || Math.abs(value) > MAX_DATE_MS) return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  function currentTimeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  }
  function isValidTimeZone(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 100) return false;
    if (timeZoneValidityCache.has(value)) return timeZoneValidityCache.get(value);
    let valid = false;
    try { new Intl.DateTimeFormat('en-US', {timeZone:value}).format(new Date()); valid = true; }
    catch { valid = false; }
    if (timeZoneValidityCache.size > 128) timeZoneValidityCache.clear();
    timeZoneValidityCache.set(value, valid);
    return valid;
  }
  function normalizeTimeZone(value, fallback = currentTimeZone()) {
    if (isValidTimeZone(value)) return value;
    return isValidTimeZone(fallback) ? fallback : 'UTC';
  }
  function normalizeAuditTimestamp(value) {
    if (value == null) return null;
    const d = validDate(value);
    return d ? d.toISOString() : null;
  }
  function zonedParts(dateLike, timeZone) {
    const d = new Date(dateLike), tz = normalizeTimeZone(timeZone);
    let formatter = zonedFormatterCache.get(tz);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-CA', {timeZone:tz, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
      if (zonedFormatterCache.size > 128) zonedFormatterCache.clear();
      zonedFormatterCache.set(tz, formatter);
    }
    const parts = formatter.formatToParts(d);
    const obj={}; for (const p of parts) if (p.type !== 'literal') obj[p.type]=p.value;
    return {year:+obj.year,month:+obj.month,day:+obj.day,hour:+obj.hour,minute:+obj.minute,second:+obj.second};
  }
  function timeZoneOffsetMs(ms, timeZone) {
    const p = zonedParts(ms, timeZone);
    const asUTC = Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    return asUTC - Math.floor(ms/1000)*1000;
  }
  function zonedLocalToDate(value, timeZone) {
    const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m || !isValidTimeZone(timeZone)) return null;
    const wanted={year:+m[1],month:+m[2],day:+m[3],hour:+m[4],minute:+m[5]};
    const target=Date.UTC(wanted.year,wanted.month-1,wanted.day,wanted.hour,wanted.minute,0);
    const offsets=new Set();
    for (const delta of [-36,-12,0,12,36]) offsets.add(timeZoneOffsetMs(target + delta*3600000, timeZone));
    const matches=[];
    for (const offset of offsets) {
      const d=new Date(target-offset);
      if (!Number.isFinite(d.getTime())) continue;
      const check=zonedParts(d,timeZone);
      if (check.year===wanted.year && check.month===wanted.month && check.day===wanted.day && check.hour===wanted.hour && check.minute===wanted.minute) matches.push(d);
    }
    // Zero matches means a nonexistent wall-clock time (spring DST jump). More
    // than one means an ambiguous repeated time (autumn DST fallback). Refuse
    // both rather than silently changing a fasting duration by an hour.
    const unique=[...new Map(matches.map(d=>[d.getTime(),d])).values()];
    return unique.length===1 ? unique[0] : null;
  }

  function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

  function sanitizeGoal(value, fallback = 16) {
    const n = parseLocalizedNumber(value);
    if (!Number.isFinite(n) || n <= 0 || n > MAX_SAFE_GOAL_HOURS) return fallback;
    return Math.round(n * 1000) / 1000;
  }

  function sanitizeWeightKg(value, fallback = null) {
    const n = parseLocalizedNumber(value);
    if (!Number.isFinite(n) || n <= 0 || n > 1000) return fallback;
    return Math.round(n * 1000) / 1000;
  }

  function normalizeWeightUnit(value) {
    return value === 'lb' ? 'lb' : 'kg';
  }

  function kgToDisplay(kg, unit = data?.weightUnit || 'kg') {
    const n = Number(kg);
    if (!Number.isFinite(n)) return null;
    return unit === 'lb' ? n * 2.2046226218 : n;
  }

  function displayToKg(value, unit = data?.weightUnit || 'kg') {
    const n = parseLocalizedNumber(value);
    if (!Number.isFinite(n)) return null;
    return unit === 'lb' ? n / 2.2046226218 : n;
  }

  function formatWeight(kg, unit = data?.weightUnit || 'kg', signed = false) {
    const shown = kgToDisplay(kg, unit);
    if (!Number.isFinite(shown)) return '—';
    const sign = signed && shown > 0 ? '+' : '';
    return `${sign}${shown.toLocaleString(currentLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unit}`;
  }

  function normalizeWeightEntry(w) {
    if (!w || typeof w !== 'object') return null;
    const when = validDate(w.when);
    const kg = sanitizeWeightKg(w.kg, null);
    if (!when || kg == null || when.getTime() > Date.now() + FUTURE_TOLERANCE_MS) return null;
    return {
      id: (typeof w.id === 'string' && w.id.length <= 120) ? w.id : makeId(),
      when: when.toISOString(),
      kg,
      timeZone: normalizeTimeZone(w.timeZone),
      createdAt: normalizeAuditTimestamp(w.createdAt),
      modifiedAt: normalizeAuditTimestamp(w.modifiedAt)
    };
  }

  function formatGoal(hours) {
    const n = sanitizeGoal(hours, 16);
    return `${n.toLocaleString(currentLocale(), { maximumFractionDigits: 3 })} ${t(pluralKey('unit.hour', n))}`;
  }

  function getStoredDataRaw() {
    // Primary history moved to IndexedDB in v1.8.0. This legacy key is read only
    // during one-time migration from older releases.
    try { return localStorage.getItem(DATA_KEY); } catch { return null; }
  }

  function openAppDb() {
    if (appDbPromise) return appDbPromise;
    appDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('state')) db.createObjectStore('state', {keyPath:'key'});
        if (!db.objectStoreNames.contains('snapshotMeta')) db.createObjectStore('snapshotMeta', {keyPath:'id'});
        if (!db.objectStoreNames.contains('snapshotPayload')) db.createObjectStore('snapshotPayload', {keyPath:'id'});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
    });
    return appDbPromise;
  }

  function idbRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  async function idbGet(storeName, key) {
    const db = await openAppDb();
    const tx = db.transaction(storeName, 'readonly');
    return idbRequest(tx.objectStore(storeName).get(key));
  }

  async function idbGetAll(storeName) {
    const db = await openAppDb();
    const tx = db.transaction(storeName, 'readonly');
    return idbRequest(tx.objectStore(storeName).getAll());
  }

  async function idbPut(storeName, value) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
    });
  }

  async function idbDelete(storeName, key) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB delete aborted'));
    });
  }

  async function idbClear(storeName) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB clear failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB clear aborted'));
    });
  }

  function canonicalRecordFingerprint(r) {
    return `${r.start}|${r.end}|${r.timeZone || ''}`;
  }

  function recordDayContribution(r) {
    const map = new Map();
    const tz = normalizeTimeZone(r.timeZone || currentTimeZone());
    const start = new Date(r.start).getTime(), end = new Date(r.end).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return map;
    // UTC is common in imports/tests and can be split without Intl/DST work.
    if (tz === 'UTC') {
      let cursor = start;
      while (cursor < end) {
        const d = new Date(cursor);
        const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
        const boundary = Math.min(end, Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()+1));
        map.set(key, (map.get(key)||0) + Math.max(0, boundary-cursor));
        cursor = boundary;
      }
      return map;
    }
    addIntervalToDayMap(map, r.start, r.end, tz);
    return map;
  }

  function buildStoredDayTotals(records) {
    const map = new Map();
    for (const r of records) {
      for (const [key, ms] of recordDayContribution(r)) map.set(key, (map.get(key)||0) + ms);
    }
    return map;
  }

  function updateStoredDayTotalsIncrementally() {
    const nextMap = new Map(data.records.map(r => [r.id, r]));
    // Remove deleted or changed old contributions.
    for (const [id, oldRecord] of persistedRecordMap) {
      const next = nextMap.get(id);
      if (next && canonicalRecordFingerprint(next) === canonicalRecordFingerprint(oldRecord)) continue;
      for (const [key, ms] of recordDayContribution(oldRecord)) {
        const value = (storedDayTotalsMap.get(key)||0) - ms;
        if (value > 0.5) storedDayTotalsMap.set(key, value); else storedDayTotalsMap.delete(key);
      }
    }
    // Add new or changed contributions.
    for (const [id, next] of nextMap) {
      const oldRecord = persistedRecordMap.get(id);
      if (oldRecord && canonicalRecordFingerprint(next) === canonicalRecordFingerprint(oldRecord)) continue;
      for (const [key, ms] of recordDayContribution(next)) storedDayTotalsMap.set(key, (storedDayTotalsMap.get(key)||0) + ms);
    }
    persistedRecordMap = nextMap;
  }

  async function persistDailyTotals(revision = data.revision) {
    await idbPut('state', {key:'dailyTotals', revision, entries:[...storedDayTotalsMap.entries()]});
  }

  async function persistPrimaryNow(snapshotData = data) {
    await idbPut('state', {key:'primary', data:snapshotData});
    await persistDailyTotals(snapshotData.revision);
    try { localStorage.setItem(DATA_REVISION_SIGNAL_KEY, JSON.stringify({revision:snapshotData.revision, at:Date.now()})); } catch {}
    return true;
  }

  let primaryPersistScheduled = false;
  function queuePrimaryPersistence() {
    ++primaryPersistTicket;
    if (primaryPersistScheduled) return primaryPersistPromise;
    primaryPersistScheduled = true;
    primaryPersistPromise = new Promise(resolve => {
      requestAnimationFrame(() => setTimeout(async () => {
        const ticketAtStart = primaryPersistTicket;
        try { await persistPrimaryNow(data); }
        catch (err) {
          console.error('IndexedDB persistence failed', err);
          setTimeout(() => alert(t('error.save')), 0);
        } finally {
          primaryPersistScheduled = false;
          resolve();
          if (primaryPersistTicket !== ticketAtStart) queuePrimaryPersistence();
        }
      }, 0));
    });
    return primaryPersistPromise;
  }

  async function flushPrimaryPersistence() {
    try { await persistPrimaryNow(data); } catch {}
  }

  async function persistSnapshotRecord(meta, snapshotData) {
    await Promise.all([
      idbPut('snapshotMeta', meta),
      idbPut('snapshotPayload', {id:meta.id, data:snapshotData})
    ]);
  }

  async function deleteSnapshotRecord(id) {
    await Promise.all([idbDelete('snapshotMeta', id), idbDelete('snapshotPayload', id)]);
  }

  async function loadSnapshotPayload(id) {
    const row = await idbGet('snapshotPayload', id);
    return row?.data || null;
  }

  async function initializePersistentStorage() {
    try {
      const dbPrimary = await idbGet('state', 'primary');
      let loaded = dbPrimary?.data || null;
      let migratedLegacy = false;
      if (!loaded) {
        const legacyRaw = getStoredDataRaw();
        if (legacyRaw) {
          loaded = validateCompatibleData(JSON.parse(legacyRaw)).data;
          migratedLegacy = true;
        }
      }
      if (loaded) {
        // Data already written by this app is canonical; avoid O(n) re-validation
        // on every launch. Full validation remains mandatory for legacy/import data.
        if (!migratedLegacy && loaded.dataVersion === DATA_VERSION && Array.isArray(loaded.records) && Array.isArray(loaded.weights) && loaded.records.length <= MAX_IMPORT_FASTS && loaded.weights.length <= MAX_IMPORT_WEIGHTS) data = loaded;
        else data = validateCompatibleData(loaded).data;
      } else data = cloneDefault();

      snapshotCache = (await idbGetAll('snapshotMeta')).map(normalizeSnapshot).filter(Boolean);
      if (!snapshotCache.length) {
        // One-time migration of old localStorage snapshots.
        try {
          const legacySnapshots = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '[]');
          if (Array.isArray(legacySnapshots)) {
            for (const legacy of legacySnapshots.slice(0, SNAPSHOT_SCAN_LIMIT)) {
              const meta = normalizeSnapshot(legacy);
              if (!meta || !legacy?.data) continue;
              const payload = validateCompatibleData(legacy.data).data;
              snapshotCache.push(meta);
              await persistSnapshotRecord(meta, payload);
            }
          }
        } catch {}
      }
      snapshotCache = pruneSnapshots(snapshotCache);

      const daily = await idbGet('state', 'dailyTotals');
      if (daily && Number(daily.revision) === Number(data.revision) && Array.isArray(daily.entries)) storedDayTotalsMap = new Map(daily.entries);
      else {
        storedDayTotalsMap = buildStoredDayTotals(data.records);
        await persistDailyTotals(data.revision);
      }
      persistedRecordMap = new Map(data.records.map(r => [r.id, r]));

      if (migratedLegacy) await persistPrimaryNow(data);
      try { localStorage.removeItem(DATA_KEY); localStorage.removeItem(SNAPSHOT_KEY); } catch {}

      let appMeta = {};
      try { appMeta = JSON.parse(localStorage.getItem(APP_META_KEY) || '{}') || {}; } catch {}
      if (appMeta.lastAppVersion !== APP_VERSION && hasBackupWorthyData()) {
        const sourceVersion = appMeta.lastAppVersion || 'previous version';
        const ok = await createInternalSnapshotAsync(`before first launch of v${APP_VERSION}`, sourceVersion);
        if (!ok) return false;
      }
      return true;
    } catch (err) {
      recoveryMode = { raw:'', error:String(err && err.message || err), enteredAt:new Date().toISOString() };
      data = cloneDefault(); snapshotCache = []; storedDayTotalsMap = new Map(); persistedRecordMap = new Map();
      return false;
    }
  }

  function snapshotDayBucket(date) {
    const d = validDate(date) || new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function snapshotWeekBucket(date) {
    const d = validDate(date) || new Date();
    const localNoon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
    const day = (localNoon.getDay() + 6) % 7;
    localNoon.setDate(localNoon.getDate() - day);
    return snapshotDayBucket(localNoon);
  }

  function snapshotMonthBucket(date) {
    const d = validDate(date) || new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
  }

  function normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const created = validDate(snapshot.createdAt);
    if (!created || typeof snapshot.id !== 'string' || !snapshot.id) return null;
    return {
      id: snapshot.id,
      createdAt: created.toISOString(),
      sourceAppVersion: String(snapshot.sourceAppVersion || 'unknown'),
      reason: String(snapshot.reason || 'recovery'),
      dayBucket: typeof snapshot.dayBucket === 'string' ? snapshot.dayBucket : snapshotDayBucket(created),
      weekBucket: typeof snapshot.weekBucket === 'string' ? snapshot.weekBucket : snapshotWeekBucket(created),
      monthBucket: typeof snapshot.monthBucket === 'string' ? snapshot.monthBucket : snapshotMonthBucket(created),
      revision: Math.max(0, Number(snapshot.revision) || 0)
    };
  }

  function pruneSnapshots(snapshots) {
    const list = snapshots.map(normalizeSnapshot).filter(Boolean)
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const keep = new Set();
    list.slice(0, SNAPSHOT_RECENT_KEEP).forEach(x => keep.add(x.id));
    const keepBuckets = (field, max) => {
      const seen = new Set();
      for (const item of list) {
        const bucket = item[field];
        if (!bucket || seen.has(bucket)) continue;
        seen.add(bucket); keep.add(item.id);
        if (seen.size >= max) break;
      }
    };
    keepBuckets('dayBucket', SNAPSHOT_DAILY_KEEP);
    keepBuckets('weekBucket', SNAPSHOT_WEEKLY_KEEP);
    keepBuckets('monthBucket', SNAPSHOT_MONTHLY_KEEP);
    return list.filter(x => keep.has(x.id)).slice(0, SNAPSHOT_SCAN_LIMIT);
  }

  function snapshotTierKeys(snapshot, snapshots) {
    const list = snapshots || loadSnapshots();
    const keys = [];
    const idx = list.findIndex(x => x.id === snapshot.id);
    if (idx >= 0 && idx < SNAPSHOT_RECENT_KEEP) keys.push('backup.tierRecent');
    const isAnchor = (field, max) => {
      const seen = new Set();
      for (const item of list) {
        const bucket = item[field];
        if (!bucket || seen.has(bucket)) continue;
        seen.add(bucket);
        if (item.id === snapshot.id) return seen.size <= max;
        if (seen.size >= max) break;
      }
      return false;
    };
    if (isAnchor('dayBucket', SNAPSHOT_DAILY_KEEP)) keys.push('backup.tierDaily');
    if (isAnchor('weekBucket', SNAPSHOT_WEEKLY_KEEP)) keys.push('backup.tierWeekly');
    if (isAnchor('monthBucket', SNAPSHOT_MONTHLY_KEEP)) keys.push('backup.tierMonthly');
    return keys;
  }

  function loadSnapshots() {
    return pruneSnapshots(snapshotCache.slice(0, SNAPSHOT_SCAN_LIMIT));
  }

  function setSnapshotProtectionState(status, kept = 0, desired = 0) {
    snapshotProtectionState = { status, kept: Math.max(0, Number(kept) || 0), desired: Math.max(0, Number(desired) || 0) };
    if (backupMeta && typeof backupMeta === 'object') {
      backupMeta.snapshotProtectionStatus = status;
      backupMeta.snapshotProtectionAt = new Date().toISOString();
      backupMeta.snapshotStoredCount = snapshotProtectionState.kept;
      backupMeta.snapshotDesiredCount = snapshotProtectionState.desired;
      saveBackupMeta();
    }
  }

  function isQuotaError(err) {
    return !!err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014);
  }

  async function pruneSnapshotStorage(previousIds = []) {
    const keepIds = new Set(snapshotCache.map(x => x.id));
    for (const id of previousIds) if (!keepIds.has(id)) {
      try { await deleteSnapshotRecord(id); } catch {}
    }
  }

  function storeSnapshots(snapshots) {
    const previousIds = snapshotCache.map(x => x.id);
    snapshotCache = pruneSnapshots(snapshots);
    setSnapshotProtectionState('ok', snapshotCache.length, snapshotCache.length);
    pruneSnapshotStorage(previousIds);
    return true;
  }

  async function createInternalSnapshotAsync(reason = 'recovery', sourceAppVersion = APP_VERSION) {
    if (typeof data === 'undefined' || !data) return null;
    try {
      const now = new Date();
      const meta = {
        id: makeId(), createdAt: now.toISOString(),
        sourceAppVersion: String(sourceAppVersion || 'unknown'), reason: String(reason || 'recovery'),
        dayBucket: snapshotDayBucket(now), weekBucket: snapshotWeekBucket(now), monthBucket: snapshotMonthBucket(now),
        revision: Math.max(0, Number(data.revision) || 0)
      };
      const before = snapshotCache.map(x => x.id);
      snapshotCache = pruneSnapshots([meta, ...snapshotCache]);
      await persistSnapshotRecord(meta, data);
      await pruneSnapshotStorage(before);
      setSnapshotProtectionState('ok', snapshotCache.length, snapshotCache.length);
      if (typeof renderSnapshotStatus === 'function') renderSnapshotStatus();
      if (typeof renderBackupStatus === 'function') renderBackupStatus();
      return meta;
    } catch (err) {
      setSnapshotProtectionState('failed', snapshotCache.length, snapshotCache.length + 1);
      return null;
    }
  }

  function createInternalSnapshot(reason = 'recovery') {
    // Non-critical callers keep a synchronous boolean API; persistence happens
    // asynchronously in IndexedDB. Critical update/import/restore paths await
    // createInternalSnapshotAsync directly.
    createInternalSnapshotAsync(reason).then(meta => {
      if (!meta && !automaticSnapshotFailureAlerted) {
        automaticSnapshotFailureAlerted = true;
        setTimeout(() => alert(t('backup.autoSnapshotFailed')), 0);
      }
    });
    return true;
  }

  function maybeCreateRollingSnapshot(reason = 'automatic change') {
    if (typeof data === 'undefined' || !data || !hasBackupWorthyData()) return true;
    createInternalSnapshotAsync(reason).then(meta => {
      if (!meta && !automaticSnapshotFailureAlerted) {
        automaticSnapshotFailureAlerted = true;
        setTimeout(() => alert(t('backup.autoSnapshotFailed')), 0);
      }
    });
    return true;
  }

  function scheduleRollingSnapshot(reason = 'automatic change') {
    // Primary app data is already written synchronously before this is called.
    // Defer the heavier recovery-snapshot rotation until the interface has had
    // a chance to paint. Rapid consecutive edits are coalesced into the newest
    // state, which is the most useful automatic recovery point.
    const ticket = ++deferredSnapshotTicket;
    requestAnimationFrame(() => {
      const run = () => {
        if (ticket !== deferredSnapshotTicket) return;
        maybeCreateRollingSnapshot(reason);
        refreshStorageProtection();
      };
      if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1200 });
      else setTimeout(run, 350);
    });
  }

  function loadBackupMeta() {
    const now = new Date().toISOString();
    let meta = {};
    try { meta = JSON.parse(localStorage.getItem(BACKUP_META_KEY) || '{}') || {}; } catch { meta = {}; }
    const first = validDate(meta.firstSeenAt);
    const firstData = validDate(meta.firstDataAt);
    const last = validDate(meta.lastExternalBackupAt);
    const snapshotAt = validDate(meta.snapshotProtectionAt);
    const normalized = {
      firstSeenAt: first ? first.toISOString() : now,
      firstDataAt: firstData ? firstData.toISOString() : null,
      lastExternalBackupAt: last ? last.toISOString() : null,
      snapshotProtectionStatus: ['ok','reduced','failed'].includes(meta.snapshotProtectionStatus) ? meta.snapshotProtectionStatus : 'ok',
      snapshotProtectionAt: snapshotAt ? snapshotAt.toISOString() : null,
      snapshotStoredCount: Math.max(0, Number(meta.snapshotStoredCount) || 0),
      snapshotDesiredCount: Math.max(0, Number(meta.snapshotDesiredCount) || 0)
    };
    try { localStorage.setItem(BACKUP_META_KEY, JSON.stringify(normalized)); } catch {}
    return normalized;
  }

  function saveBackupMeta() {
    try { localStorage.setItem(BACKUP_META_KEY, JSON.stringify(backupMeta)); } catch {}
  }

  function reloadBackupMetaFromStorage() {
    backupMeta = loadBackupMeta();
    snapshotProtectionState = {
      status: ['ok','reduced','failed'].includes(backupMeta.snapshotProtectionStatus) ? backupMeta.snapshotProtectionStatus : 'ok',
      kept: Math.max(0, Number(backupMeta.snapshotStoredCount) || 0),
      desired: Math.max(0, Number(backupMeta.snapshotDesiredCount) || 0)
    };
  }

  function captureVersionTransitionSnapshot() {
    let appMeta = {};
    try { appMeta = JSON.parse(localStorage.getItem(APP_META_KEY) || '{}') || {}; } catch { appMeta = {}; }
    if (appMeta.lastAppVersion === APP_VERSION) return true;
    const raw = getStoredDataRaw();
    if (!raw) return true;
    try {
      const parsedRaw = JSON.parse(raw);
      const sourceVersion = appMeta.lastAppVersion || 'previous version';
      const latest = loadSnapshots()[0];
      // A controlled update already creates a verified pre-update snapshot. Do not
      // consume another rolling slot with an identical copy on first launch.
      if (latest && latest.sourceAppVersion === sourceVersion && JSON.stringify(latest.data) === JSON.stringify(parsedRaw)) return true;
      return !!pushSnapshotData(parsedRaw, `before first launch of v${APP_VERSION}`, sourceVersion);
    } catch { return false; }
  }

  function migrateData(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid data');
    const version = Number(parsed.dataVersion);
    switch (version) {
      case 1: return parsed;
      default: throw new Error('unsupported data format');
    }
  }

  function rememberCurrentAppVersion() {
    try { localStorage.setItem(APP_META_KEY, JSON.stringify({ lastAppVersion: APP_VERSION, seenAt: new Date().toISOString() })); } catch {}
  }

  function normalizeRecord(r) {
    if (!r || typeof r !== 'object') return null;
    const start = validDate(r.start), end = validDate(r.end);
    if (!start || !end || end <= start || end.getTime() > Date.now() + FUTURE_TOLERANCE_MS) return null;
    return {
      id: (typeof r.id === 'string' && r.id.length <= 120) ? r.id : makeId(),
      start: start.toISOString(),
      end: end.toISOString(),
      goalHours: sanitizeGoal(r.goalHours, 16),
      timeZone: normalizeTimeZone(r.timeZone),
      createdAt: normalizeAuditTimestamp(r.createdAt),
      modifiedAt: normalizeAuditTimestamp(r.modifiedAt)
    };
  }

  function normalizeData(parsed) {
    parsed = migrateData(parsed);
    if (parsed.dataVersion !== DATA_VERSION) throw new Error('unsupported data format');
    const goal = sanitizeGoal(parsed.goalHours, 16);
    const active = validDate(parsed.activeStart);
    const activeValid = active && active.getTime() <= Date.now() + FUTURE_TOLERANCE_MS;
    return {
      dataVersion: DATA_VERSION,
      revision: Number.isInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 0,
      updatedAt: validDate(parsed.updatedAt) ? validDate(parsed.updatedAt).toISOString() : null,
      goalHours: goal,
      activeStart: activeValid ? active.toISOString() : null,
      activeGoalHours: activeValid ? sanitizeGoal(parsed.activeGoalHours, goal) : null,
      activeTimeZone: activeValid ? normalizeTimeZone(parsed.activeTimeZone) : null,
      activeCreatedAt: activeValid ? normalizeAuditTimestamp(parsed.activeCreatedAt) : null,
      activeModifiedAt: activeValid ? normalizeAuditTimestamp(parsed.activeModifiedAt) : null,
      records: Array.isArray(parsed.records) ? parsed.records.map(normalizeRecord).filter(Boolean) : [],
      weights: Array.isArray(parsed.weights) ? parsed.weights.map(normalizeWeightEntry).filter(Boolean) : [],
      weightUnit: normalizeWeightUnit(parsed.weightUnit),
      targetWeightKg: sanitizeWeightKg(parsed.targetWeightKg, null),
      gamificationEnabled: parsed.gamificationEnabled !== false,
      language: normalizeLanguage(parsed.language),
      appearance: normalizeAppearance(parsed.appearance),
      iconChoice: normalizeIconChoice(parsed.iconChoice)
    };
  }

  function prepareCompatibleData(rawData) {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) throw new Error('invalid data');
    const candidate = JSON.parse(JSON.stringify(rawData));
    let changed = false;
    const mark = (key, value) => {
      if (candidate[key] !== value) { candidate[key] = value; changed = true; }
    };

    // dataVersion identifies the machine format. v1 has intentionally remained
    // backward compatible while optional metadata has evolved. Repair metadata
    // here; reserve Recovery mode for unreadable/unsupported data or damaged
    // core history values (timestamps, durations and weights).
    if (Number(candidate.dataVersion) !== DATA_VERSION) return { data: candidate, changed };
    if (candidate.dataVersion !== DATA_VERSION) mark('dataVersion', DATA_VERSION);
    if (candidate.records === undefined) { candidate.records = []; changed = true; }
    if (candidate.weights === undefined) { candidate.weights = []; changed = true; }

    if (candidate.revision != null && (!Number.isInteger(candidate.revision) || candidate.revision < 0)) mark('revision', 0);
    if (candidate.updatedAt != null && !validDate(candidate.updatedAt)) mark('updatedAt', null);

    const parsedGoal = parseLocalizedNumber(candidate.goalHours);
    const fallbackGoal = Number.isFinite(parsedGoal) && parsedGoal > 0 && parsedGoal <= MAX_SAFE_GOAL_HOURS
      ? sanitizeGoal(candidate.goalHours, 16) : 16;
    if (candidate.goalHours !== fallbackGoal) mark('goalHours', fallbackGoal);

    const weightUnit = normalizeWeightUnit(candidate.weightUnit);
    if (candidate.weightUnit !== weightUnit) mark('weightUnit', weightUnit);
    const language = normalizeLanguage(candidate.language);
    if (candidate.language !== language) mark('language', language);
    const appearance = normalizeAppearance(candidate.appearance);
    if (candidate.appearance !== appearance) mark('appearance', appearance);
    const iconChoice = normalizeIconChoice(candidate.iconChoice);
    if (candidate.iconChoice !== iconChoice) mark('iconChoice', iconChoice);
    if (typeof candidate.gamificationEnabled !== 'boolean') mark('gamificationEnabled', true);
    if (candidate.targetWeightKg != null) {
      const target = sanitizeWeightKg(candidate.targetWeightKg, null);
      if (target == null) mark('targetWeightKg', null);
      else if (candidate.targetWeightKg !== target) mark('targetWeightKg', target);
    }

    const fallbackZone = currentTimeZone();
    const usedFastIds = new Set();
    if (Array.isArray(candidate.records)) {
      candidate.records = candidate.records.map((record, index) => {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
        const next = {...record};
        const start = validDate(next.start), end = validDate(next.end);
        const baseId = `legacy-fast-${index + 1}-${start ? start.getTime() : index}`.slice(0, 110);
        let id = typeof next.id === 'string' && next.id && next.id.length <= 120 ? next.id : baseId;
        if (usedFastIds.has(id)) {
          let suffix = 2;
          while (usedFastIds.has(`${baseId}-${suffix}`)) suffix++;
          id = `${baseId}-${suffix}`.slice(0, 120);
        }
        usedFastIds.add(id);
        if (next.id !== id) { next.id = id; changed = true; }
        const goal = sanitizeGoal(next.goalHours, fallbackGoal);
        if (next.goalHours !== goal) { next.goalHours = goal; changed = true; }
        const zone = normalizeTimeZone(next.timeZone, fallbackZone);
        if (next.timeZone !== zone) { next.timeZone = zone; changed = true; }
        for (const key of ['createdAt','modifiedAt']) {
          const audit = normalizeAuditTimestamp(next[key]);
          if (next[key] !== audit) { next[key] = audit; changed = true; }
        }
        // Canonicalize valid timestamps without guessing damaged core dates.
        if (start && next.start !== start.toISOString()) { next.start = start.toISOString(); changed = true; }
        if (end && next.end !== end.toISOString()) { next.end = end.toISOString(); changed = true; }
        return next;
      });
    }

    const usedWeightIds = new Set();
    if (Array.isArray(candidate.weights)) {
      candidate.weights = candidate.weights.map((weight, index) => {
        if (!weight || typeof weight !== 'object' || Array.isArray(weight)) return weight;
        const next = {...weight};
        const when = validDate(next.when);
        const baseId = `legacy-weight-${index + 1}-${when ? when.getTime() : index}`.slice(0, 110);
        let id = typeof next.id === 'string' && next.id && next.id.length <= 120 ? next.id : baseId;
        if (usedWeightIds.has(id)) {
          let suffix = 2;
          while (usedWeightIds.has(`${baseId}-${suffix}`)) suffix++;
          id = `${baseId}-${suffix}`.slice(0, 120);
        }
        usedWeightIds.add(id);
        if (next.id !== id) { next.id = id; changed = true; }
        const zone = normalizeTimeZone(next.timeZone, fallbackZone);
        if (next.timeZone !== zone) { next.timeZone = zone; changed = true; }
        for (const key of ['createdAt','modifiedAt']) {
          const audit = normalizeAuditTimestamp(next[key]);
          if (next[key] !== audit) { next[key] = audit; changed = true; }
        }
        if (when && next.when !== when.toISOString()) { next.when = when.toISOString(); changed = true; }
        const kg = sanitizeWeightKg(next.kg, null);
        if (kg != null && next.kg !== kg) { next.kg = kg; changed = true; }
        return next;
      });
    }

    if (candidate.activeStart != null) {
      const active = validDate(candidate.activeStart);
      if (active && candidate.activeStart !== active.toISOString()) mark('activeStart', active.toISOString());
      const activeGoal = sanitizeGoal(candidate.activeGoalHours, fallbackGoal);
      if (candidate.activeGoalHours !== activeGoal) mark('activeGoalHours', activeGoal);
      const activeZone = normalizeTimeZone(candidate.activeTimeZone, fallbackZone);
      if (candidate.activeTimeZone !== activeZone) mark('activeTimeZone', activeZone);
      const activeCreated = normalizeAuditTimestamp(candidate.activeCreatedAt);
      if (candidate.activeCreatedAt !== activeCreated) mark('activeCreatedAt', activeCreated);
      const activeModified = normalizeAuditTimestamp(candidate.activeModifiedAt);
      if (candidate.activeModifiedAt !== activeModified) mark('activeModifiedAt', activeModified);
    } else {
      if (candidate.activeStart !== null) mark('activeStart', null);
      if (candidate.activeGoalHours != null) mark('activeGoalHours', null);
      if (candidate.activeTimeZone != null) mark('activeTimeZone', null);
      if (candidate.activeCreatedAt != null) mark('activeCreatedAt', null);
      else if (candidate.activeCreatedAt === undefined) mark('activeCreatedAt', null);
      if (candidate.activeModifiedAt != null) mark('activeModifiedAt', null);
      else if (candidate.activeModifiedAt === undefined) mark('activeModifiedAt', null);
    }
    return { data: candidate, changed };
  }

  function validateCompatibleData(rawData) {
    const prepared = prepareCompatibleData(rawData);
    return { data: validateImportedData(prepared.data), changed: prepared.changed };
  }

  function validateImportedData(rawData) {
    rawData = migrateData(rawData);
    if (rawData.dataVersion !== DATA_VERSION) throw new Error('unsupported data format');
    if (!Array.isArray(rawData.records) || !Array.isArray(rawData.weights)) throw new Error('missing arrays');
    if (rawData.revision != null && (!Number.isInteger(rawData.revision) || rawData.revision < 0)) throw new Error('invalid revision');
    if (rawData.updatedAt != null && !validDate(rawData.updatedAt)) throw new Error('invalid updated time');
    if (rawData.records.length > MAX_IMPORT_FASTS || rawData.weights.length > MAX_IMPORT_WEIGHTS) throw new Error('too many records');
    if (!Number.isFinite(parseLocalizedNumber(rawData.goalHours)) || parseLocalizedNumber(rawData.goalHours) <= 0 || parseLocalizedNumber(rawData.goalHours) > MAX_SAFE_GOAL_HOURS) throw new Error('invalid default goal');
    if (!['kg','lb'].includes(rawData.weightUnit)) throw new Error('invalid weight unit');
    if (rawData.language != null && typeof rawData.language !== 'string') throw new Error('invalid language');
    if (!['system','light','dark'].includes(rawData.appearance)) throw new Error('invalid appearance');
    if (rawData.iconChoice != null && !['plate','moon','hourglass','timer'].includes(rawData.iconChoice)) throw new Error('invalid icon choice');
    if (typeof rawData.gamificationEnabled !== 'boolean') throw new Error('invalid gamification setting');
    if (rawData.targetWeightKg != null && sanitizeWeightKg(rawData.targetWeightKg, null) == null) throw new Error('invalid target weight');
    if (rawData.activeStart != null) {
      if (!validDate(rawData.activeStart) || validDate(rawData.activeStart).getTime() > Date.now() + FUTURE_TOLERANCE_MS) throw new Error('invalid active fast');
      if (!Number.isFinite(parseLocalizedNumber(rawData.activeGoalHours)) || parseLocalizedNumber(rawData.activeGoalHours) <= 0 || parseLocalizedNumber(rawData.activeGoalHours) > MAX_SAFE_GOAL_HOURS) throw new Error('invalid active goal');
      if (!isValidTimeZone(rawData.activeTimeZone)) throw new Error('invalid active timezone');
      if (rawData.activeCreatedAt != null && !validDate(rawData.activeCreatedAt)) throw new Error('invalid active creation time');
      if (rawData.activeModifiedAt != null && !validDate(rawData.activeModifiedAt)) throw new Error('invalid active modification time');
    } else if (rawData.activeGoalHours != null || rawData.activeTimeZone != null || rawData.activeCreatedAt != null || rawData.activeModifiedAt != null) {
      throw new Error('orphan active fast metadata');
    }

    const records = rawData.records.map(r => {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || r.id.length > 120) throw new Error('invalid record id');
      if (!Number.isFinite(parseLocalizedNumber(r.goalHours)) || parseLocalizedNumber(r.goalHours) <= 0 || parseLocalizedNumber(r.goalHours) > MAX_SAFE_GOAL_HOURS) throw new Error('invalid record goal');
      if (!isValidTimeZone(r.timeZone)) throw new Error('invalid record timezone');
      if (r.createdAt != null && !validDate(r.createdAt)) throw new Error('invalid record creation time');
      if (r.modifiedAt != null && !validDate(r.modifiedAt)) throw new Error('invalid record modification time');
      const normalized = normalizeRecord(r);
      if (!normalized) throw new Error('invalid fasting record');
      return normalized;
    });
    if (new Set(records.map(r => r.id)).size !== records.length) throw new Error('duplicate fasting ids');
    // Legacy overlap is a semantic conflict, not unreadable storage. Preserve it
    // instead of trapping the whole app in Recovery mode; editing/backdating UI
    // continues to prevent creation of new overlaps.

    const weights = rawData.weights.map(w => {
      if (!w || typeof w !== 'object' || typeof w.id !== 'string' || !w.id || w.id.length > 120) throw new Error('invalid weight id');
      if (sanitizeWeightKg(w.kg, null) == null) throw new Error('invalid weight value');
      if (!isValidTimeZone(w.timeZone)) throw new Error('invalid weight timezone');
      if (w.createdAt != null && !validDate(w.createdAt)) throw new Error('invalid weight creation time');
      if (w.modifiedAt != null && !validDate(w.modifiedAt)) throw new Error('invalid weight modification time');
      const normalized = normalizeWeightEntry(w);
      if (!normalized) throw new Error('invalid weight record');
      return normalized;
    });
    if (new Set(weights.map(w => w.id)).size !== weights.length) throw new Error('duplicate weight ids');

    const normalized = normalizeData(rawData);
    // Preserve legacy active/history overlap as-is. Recovery mode is for data that
    // cannot be read safely, not for a correctable historical business-rule clash.
    normalized.records = records;
    normalized.weights = weights;
    return normalized;
  }

  function load() { return data; }

  function invalidateDerivedCaches() {
    completedDayMapCache = null;
    currentStreakCache = null;
    statsSummaryCache = null;
    currentZoneDaySummaryCache = null;
    statsVizRendered.clear();
    trendChartDaysCache = null;
    weeklySummariesCache = null;
    calendarDaysCache.clear();
  }

  function markViewsDirty(...views) {
    const targets = views.length ? views : Object.keys(viewDirty);
    for (const view of targets) if (Object.prototype.hasOwnProperty.call(viewDirty, view)) viewDirty[view] = true;
  }

  async function reloadFromIndexedDB({ notify = false } = {}) {
    if (recoveryMode) return false;
    try {
      const row = await idbGet('state', 'primary');
      const next = row?.data || cloneDefault();
      const openModal = visibleModal();
      const activeField = document.activeElement;
      const interruptedEdit = !!(editingRecordId || editingWeightId ||
        (openModal && (openModal.id === 'entryModal' || openModal.id === 'weightModal' || openModal.id === 'backdateModal' || openModal.id === 'activeTargetModal')) ||
        activeField === goalHours || activeField === el('weightTargetInput') || activeField === el('activeTargetInput'));
      data = next;
      const daily = await idbGet('state', 'dailyTotals');
      storedDayTotalsMap = daily && Number(daily.revision) === Number(data.revision) && Array.isArray(daily.entries)
        ? new Map(daily.entries) : buildStoredDayTotals(data.records);
      persistedRecordMap = new Map(data.records.map(r => [r.id, r]));
      historyVisibleCount = HISTORY_PAGE_SIZE;
      weightVisibleCount = HISTORY_PAGE_SIZE;
      invalidateDerivedCaches();
      if (interruptedEdit) {
        editingRecordId = null; editingWeightId = null;
        editingRecordTimeZone = null; editingWeightTimeZone = null;
        const modal = visibleModal();
        if (modal && (modal.id === 'entryModal' || modal.id === 'weightModal' || modal.id === 'backdateModal' || modal.id === 'activeTargetModal')) hideModal(modal.id);
        if (activeField instanceof HTMLElement) activeField.blur();
      }
      renderAll();
      if (notify || interruptedEdit) alert(t('sync.conflict'));
      return true;
    } catch (err) {
      recoveryMode = { raw:'', error:String(err && err.message || err), enteredAt:new Date().toISOString() };
      renderAll();
      return false;
    }
  }

  function syncFromStoredRaw(_raw, { notify = false } = {}) {
    reloadFromIndexedDB({notify});
    return true;
  }

  function writePrimaryDataWithSnapshotReclaim(_serialized) {
    queuePrimaryPersistence();
    return true;
  }

  function persistResolvedData(candidate) {
    try {
      const normalized = validateCompatibleData(candidate).data;
      normalized.revision = Math.max(0, Number(normalized.revision) || 0) + 1;
      normalized.updatedAt = new Date().toISOString();
      data = normalized;
      storedDayTotalsMap = buildStoredDayTotals(data.records);
      persistedRecordMap = new Map(data.records.map(r => [r.id, r]));
      recoveryMode = null;
      invalidateDerivedCaches();
      rememberCurrentAppVersion();
      queuePrimaryPersistence();
      scheduleRollingSnapshot('automatic change');
      return true;
    } catch {
      alert(t('error.save'));
      return false;
    }
  }

  function save({ deferSnapshot = true, invalidateDerived = true, dirtyViews = null } = {}) {
    if (recoveryMode) {
      alert(t('recovery.writeBlocked'));
      return false;
    }
    try {
      if (!Array.isArray(data.records) || !Array.isArray(data.weights) || data.records.length > MAX_IMPORT_FASTS || data.weights.length > MAX_IMPORT_WEIGHTS) throw new Error('record limit exceeded');
      const fastingHistoryMayHaveChanged = !Array.isArray(dirtyViews) || dirtyViews.includes('history') || dirtyViews.includes('fasting');
      if (fastingHistoryMayHaveChanged) updateStoredDayTotalsIncrementally();
      data.revision = Math.max(0, Number(data.revision) || 0) + 1;
      data.updatedAt = new Date().toISOString();
      if (invalidateDerived) invalidateDerivedCaches();
      markViewsDirty(...(Array.isArray(dirtyViews) ? dirtyViews : ['fasting','history','weight','stats','settings']));
      queuePrimaryPersistence();
      if (deferSnapshot) scheduleRollingSnapshot('automatic change');
      else maybeCreateRollingSnapshot('automatic change');
      return true;
    } catch {
      alert(t('error.save'));
      return false;
    }
  }

  function exactDuration(ms) {
    ms = Math.max(0, ms);
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function friendlyDuration(ms, includeMinutes = true) {
    ms = Math.max(0, ms);
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const minutes = totalMin % 60;
    if (days > 0) return `${formatNumber(days)} ${t(pluralKey('unit.day', days))} ${formatNumber(hours)}${t('unit.h')}${includeMinutes ? ` ${formatNumber(minutes)}${t('unit.m')}` : ''}`;
    if (hours > 0) return `${formatNumber(hours)}${t('unit.h')}${includeMinutes ? ` ${formatNumber(minutes)}${t('unit.m')}` : ''}`;
    return `${formatNumber(minutes)}${t('unit.m')}`;
  }

  function compactDuration(ms) {
    ms = Math.max(0, ms);
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const minutes = totalMin % 60;
    if (days > 0) return `${formatNumber(days)}${t('unit.d')} ${formatNumber(hours)}${t('unit.h')}`;
    if (hours > 0) return `${formatNumber(hours)}${t('unit.h')} ${formatNumber(minutes)}${t('unit.m')}`;
    return `${formatNumber(minutes)}${t('unit.m')}`;
  }

  function dayKey(dateLike, timeZone = currentTimeZone()) {
    const p = zonedParts(dateLike, timeZone);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  }

  function localDateLabel(dateLike, timeZone = null) {
    const opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    if (timeZone) opts.timeZone = normalizeTimeZone(timeZone);
    return new Date(dateLike).toLocaleDateString(currentLocale(), opts);
  }

  function localDateTimeLabel(dateLike, timeZone = null) {
    const d = new Date(dateLike), tz = timeZone ? normalizeTimeZone(timeZone) : null;
    const yearNow = Number(zonedParts(Date.now(), tz || currentTimeZone()).year);
    const yearThere = Number(zonedParts(d, tz || currentTimeZone()).year);
    const dateOpts = { day: 'numeric', month: 'short', year: yearThere === yearNow ? undefined : 'numeric' };
    const timeOpts = { hour: '2-digit', minute: '2-digit' };
    if (tz) { dateOpts.timeZone = tz; timeOpts.timeZone = tz; }
    return `${d.toLocaleDateString(currentLocale(), dateOpts)}, ${d.toLocaleTimeString(currentLocale(), timeOpts)}`;
  }

  function localTimeLabel(dateLike, timeZone = null) {
    const d = new Date(dateLike), opts = { hour: '2-digit', minute: '2-digit' };
    if (timeZone) opts.timeZone = normalizeTimeZone(timeZone);
    return d.toLocaleTimeString(currentLocale(), opts);
  }

  function nextZonedDayBoundary(ms, timeZone) {
    const tz=normalizeTimeZone(timeZone), key=dayKey(ms,tz);
    let lo=ms, hi=ms+30*3600000;
    while (dayKey(hi,tz)===key && hi-ms<72*3600000) hi+=12*3600000;
    if (dayKey(hi,tz)===key) return hi;
    while (hi-lo>1000) { const mid=Math.floor((lo+hi)/2); if (dayKey(mid,tz)===key) lo=mid; else hi=mid; }
    return hi;
  }
  function addIntervalToDayMap(map, startLike, endLike, timeZone) {
    const tz=normalizeTimeZone(timeZone), end=new Date(endLike).getTime();
    let cursor=new Date(startLike).getTime(), guard=0;
    while (cursor<end && guard++<10000) {
      const key=dayKey(cursor,tz), boundary=Math.min(end,nextZonedDayBoundary(cursor,tz));
      map.set(key,(map.get(key)||0)+Math.max(0,boundary-cursor));
      cursor=Math.max(boundary,cursor+1);
    }
  }
  function completedFastingByStoredCalendarDay() {
    return storedDayTotalsMap;
  }
  function fastingByStoredCalendarDay() {
    const map = new Map(completedFastingByStoredCalendarDay());
    if (data.activeStart) addIntervalToDayMap(map, data.activeStart, new Date(), data.activeTimeZone || currentTimeZone());
    return map;
  }

  function recordMs(r) { return Math.max(0, new Date(r.end) - new Date(r.start)); }
  function goalMs(hours = data.goalHours) { return sanitizeGoal(hours, data.goalHours) * 3600000; }
  function recordMetGoal(r) { return recordMs(r) >= goalMs(r.goalHours ?? data.goalHours); }
  function activeTargetHours() { return data.activeStart ? sanitizeGoal(data.activeGoalHours, data.goalHours) : data.goalHours; }

  function fastingMsForDay(dayDate) {
    const key = dayKey(dayDate, currentTimeZone());
    let total = completedFastingByStoredCalendarDay().get(key) || 0;
    if (data.activeStart) {
      const active = new Map();
      addIntervalToDayMap(active, data.activeStart, new Date(), data.activeTimeZone || currentTimeZone());
      total += active.get(key) || 0;
    }
    return total;
  }

  function updateGoalChips() {
    document.querySelectorAll('.chip[data-goal]').forEach(chip => {
      const active = Number(chip.dataset.goal) === data.goalHours; chip.classList.toggle('active', active); chip.setAttribute('aria-pressed', String(active));
    });
  }


  const SCIENCE_STAGES = [
    { max: 8, key: 0 }, { max: 12, key: 1 }, { max: 24, key: 2 },
    { max: 36, key: 3 }, { max: 48, key: 4 }, { max: Infinity, key: 5 }
  ];

  function updateScienceCard() {
    const stages = [...document.querySelectorAll('.scienceStage')];
    stages.forEach(x => x.classList.remove('current'));
    if (!data.activeStart) {
      el('scienceWindow').textContent = t('science.notFasting');
      el('scienceEvidence').textContent = t('science.limited');
      el('scienceText').textContent = t('science.idle');
      return;
    }
    const startMs = new Date(data.activeStart).getTime();
    const hours = Math.max(0, (Date.now() - startMs) / 3600000);
    let index = SCIENCE_STAGES.findIndex(stage => hours < stage.max);
    if (index < 0) index = SCIENCE_STAGES.length - 1;
    const stage = SCIENCE_STAGES[index];
    el('scienceWindow').textContent = t(`science.stage${stage.key}`);
    el('scienceEvidence').textContent = t(`science.stage${stage.key}e`);
    el('scienceText').textContent = t(`science.stage${stage.key}t`);
    if (stages[index]) stages[index].classList.add('current');
  }

  function updateTimer() {
    const targetHours = activeTargetHours();
    goalText.textContent = data.activeStart ? t('fasting.targetLocked', {goal: formatGoal(targetHours)}) : t('fasting.target', {goal: formatGoal(data.goalHours)});
    if (document.activeElement !== goalHours) goalHours.value = formatNumber(data.goalHours, 0, 3);
    updateGoalChips();

    if (data.activeStart) {
      const startMs = new Date(data.activeStart).getTime();
      const elapsed = Math.max(0, Date.now() - startMs);
      const targetMs = goalMs(targetHours);
      const pct = targetMs > 0 ? (elapsed / targetMs) * 100 : 0;
      timer.textContent = exactDuration(elapsed);
      friendlyTimer.textContent = friendlyDuration(elapsed);
      statusText.textContent = t('fasting.started', {date: localDateTimeLabel(data.activeStart, data.activeTimeZone)});
      toggleFast.textContent = t('fasting.stop');
      toggleFast.classList.add('stop');
      startEarlierBtn.hidden = true;
      editActiveTargetBtn.hidden = false;
      const visualPct = Math.min(100, Math.max(0, pct));
      fastProgressTrack.style.setProperty('--fast-progress-angle', `${visualPct * 3.6}deg`);
      fastProgressTrack.classList.toggle('reached', pct >= 100);
      fastProgressTrack.setAttribute('aria-valuenow', String(Math.round(visualPct)));
      fastProgressTrack.setAttribute('aria-valuetext', pct >= 100 ? t('fasting.targetReached', {duration:friendlyDuration(Math.max(0, elapsed - targetMs))}) : t('fasting.progress', {pct:formatNumber(Math.min(99.9, pct), pct < 10 ? 1 : 0, pct < 10 ? 1 : 0), duration:friendlyDuration(Math.max(0, targetMs - elapsed))}));
      const targetMoment = el('targetMoment');
      const targetAt = safeTargetDate(startMs, targetMs);
      targetMoment.hidden = !targetAt;
      if (targetAt) targetMoment.textContent = elapsed >= targetMs
        ? t('fasting.targetTimePassed', {date: localDateTimeLabel(targetAt, data.activeTimeZone)})
        : t('fasting.expectedTargetTime', {date: localDateTimeLabel(targetAt, data.activeTimeZone)});

      if (elapsed >= targetMs) {
        const beyond = elapsed - targetMs;
        progressDetail.textContent = t('fasting.targetReached', {duration: friendlyDuration(beyond)});
        progressDetail.classList.add('good');
      } else {
        const remaining = targetMs - elapsed;
        progressDetail.textContent = t('fasting.progress', {pct: formatNumber(Math.min(99.9, pct), pct < 10 ? 1 : 0, pct < 10 ? 1 : 0), duration: friendlyDuration(remaining)});
        progressDetail.classList.remove('good');
      }
    } else {
      timer.textContent = '00:00:00';
      friendlyTimer.textContent = `0${t('unit.h')} 0${t('unit.m')}`;
      statusText.textContent = t('fasting.ready');
      toggleFast.textContent = t('fasting.start');
      toggleFast.classList.remove('stop');
      startEarlierBtn.hidden = false;
      editActiveTargetBtn.hidden = true;
      fastProgressTrack.style.setProperty('--fast-progress-angle', '0deg');
      fastProgressTrack.classList.remove('reached');
      fastProgressTrack.setAttribute('aria-valuenow', '0');
      fastProgressTrack.setAttribute('aria-valuetext', t('fasting.zeroProgress'));
      progressDetail.textContent = t('fasting.zeroProgress');
      progressDetail.classList.remove('good');
      el('targetMoment').hidden = true;
      el('targetMoment').textContent = '';
    }

    updateScienceCard();
    updateToday();
  }

  function showBackdateError(message) {
    const box = el('backdateError');
    box.textContent = message || '';
    box.hidden = !message;
  }

  function clearBackdateConflict() {
    backdateConflictRecords = [];
    el('backdateConflict').hidden = true;
    el('backdateConflictList').replaceChildren();
    el('backdateStartBtn').hidden = false;
  }

  function backdateConflicts(start, end = new Date()) {
    const s = start.getTime(), e = end.getTime();
    return data.records.filter(r => {
      const rs = new Date(r.start).getTime(), re = new Date(r.end).getTime();
      return s < re && e > rs;
    }).sort((a,b) => new Date(a.end) - new Date(b.end));
  }

  function renderBackdateConflict(conflicts) {
    backdateConflictRecords = conflicts;
    const panel = el('backdateConflict');
    const list = el('backdateConflictList');
    list.replaceChildren();
    if (!conflicts.length) { clearBackdateConflict(); return; }

    el('backdateConflictTitle').textContent = conflicts.length === 1
      ? t('backdate.conflictTitle')
      : t('backdate.conflictTitleMany', {n: conflicts.length});

    for (const r of conflicts) {
      const line = document.createElement('div');
      line.className = 'small';
      line.textContent = t('backdate.conflictLine', {
        start: localDateTimeLabel(r.start, r.timeZone),
        end: localDateTimeLabel(r.end, r.timeZone),
        duration: friendlyDuration(recordMs(r))
      });
      list.append(line);
    }

    const latest = conflicts[conflicts.length - 1];
    const latestEnd = new Date(latest.end);
    el('backdateConflictHint').textContent = t('backdate.conflictHint', {time: localDateTimeLabel(latest.end, latest.timeZone)});
    el('backdateAdjustBtn').textContent = t('backdate.startAfter', {time: localTimeLabel(latestEnd, latest.timeZone)});
    el('backdateEditConflictBtn').hidden = conflicts.length !== 1;
    el('backdateDeleteConflictBtn').hidden = conflicts.length !== 1;
    el('backdateStartBtn').hidden = true;
    panel.hidden = false;
  }

  function setBackdatePreset(hours) {
    const d = new Date(Date.now() - Number(hours) * 3600000);
    el('backdateStart').value = toLocalInputValue(d, currentTimeZone());
    showBackdateError('');
    clearBackdateConflict();
  }

  function openBackdateModal() {
    if (data.activeStart || recoveryMode) return;
    const suggested = new Date(Date.now() - 3 * 3600000);
    el('backdateStart').value = toLocalInputValue(suggested, currentTimeZone());
    el('backdateTargetSummary').textContent = t('backdate.target', {goal: formatGoal(data.goalHours)});
    showBackdateError('');
    clearBackdateConflict();
    showModal('backdateModal', 'backdateStart');
  }

  function closeBackdateModal() {
    showBackdateError('');
    clearBackdateConflict();
    hideModal('backdateModal');
  }

  function saveBackdatedActiveFast() {
    if (data.activeStart) { closeBackdateModal(); return; }
    const tz = currentTimeZone();
    const start = zonedLocalToDate(el('backdateStart').value, tz);
    if (!start) { showBackdateError(t('backdate.errStart')); clearBackdateConflict(); return; }
    if (start.getTime() > Date.now() + FUTURE_TOLERANCE_MS) { showBackdateError(t('backdate.errFuture')); clearBackdateConflict(); return; }
    const conflicts = backdateConflicts(start, new Date());
    if (conflicts.length) { showBackdateError(''); renderBackdateConflict(conflicts); return; }
    data.activeStart = start.toISOString();
    data.activeGoalHours = data.goalHours;
    data.activeTimeZone = tz;
    data.activeCreatedAt = new Date().toISOString();
    data.activeModifiedAt = null;
    if (!save()) { renderAll(); return; }
    closeBackdateModal();
    renderAll();
  }

  function adjustBackdateAfterConflicts() {
    if (!backdateConflictRecords.length) return;
    const latest = backdateConflictRecords[backdateConflictRecords.length - 1];
    const end = new Date(latest.end);
    el('backdateStart').value = toLocalInputValue(end, currentTimeZone());
    clearBackdateConflict();
    saveBackdatedActiveFast();
  }

  function editBackdateConflict() {
    if (backdateConflictRecords.length !== 1) return;
    const record = backdateConflictRecords[0];
    closeBackdateModal();
    openEntryModal(record);
  }

  function deleteBackdateConflictAndStart() {
    if (backdateConflictRecords.length !== 1) return;
    const record = backdateConflictRecords[0];
    if (!confirm(t('backdate.deleteConfirm'))) return;
    data.records = data.records.filter(r => r.id !== record.id);
    if (!save()) { renderAll(); return; }
    clearBackdateConflict();
    saveBackdatedActiveFast();
  }

  function startFast() {
    const createdAt = new Date().toISOString();
    data.activeStart = createdAt;
    data.activeGoalHours = data.goalHours;
    data.activeTimeZone = currentTimeZone();
    data.activeCreatedAt = createdAt;
    data.activeModifiedAt = null;
    if (!save()) { renderAll(); return; }
    renderAll();
  }

  function stopFast() {
    const end = new Date(), start = validDate(data.activeStart);
    const targetHours = activeTargetHours();
    const createdAt = normalizeAuditTimestamp(data.activeCreatedAt);
    const modifiedAt = normalizeAuditTimestamp(data.activeModifiedAt);
    if (!start) {
      data.activeStart = null;
      data.activeGoalHours = null;
      data.activeTimeZone = null;
      data.activeCreatedAt = null;
      data.activeModifiedAt = null;
      if (!save()) { renderAll(); return; }
      renderAll();
      return;
    }
    const duration = end - start;
    if (duration <= 0) { alert(t('fasting.clockError')); return; }
    if (duration < 60000 && !confirm(t('fasting.shortConfirm'))) {
      data.activeStart = null;
      data.activeGoalHours = null;
      data.activeTimeZone = null;
      data.activeCreatedAt = null;
      data.activeModifiedAt = null;
      if (!save()) { renderAll(); return; }
      renderAll();
      return;
    }
    if (duration > 0) {
      data.records.push({ id: makeId(), start: start.toISOString(), end: end.toISOString(), goalHours: targetHours, timeZone: data.activeTimeZone || currentTimeZone(), createdAt, modifiedAt });
    }
    data.activeStart = null;
    data.activeGoalHours = null;
    data.activeTimeZone = null;
    data.activeCreatedAt = null;
    data.activeModifiedAt = null;
    if (!save()) { renderAll(); return; }
    renderAll();
  }

  toggleFast.addEventListener('click', () => {
    if (fastActionLocked || recoveryMode) return;
    fastActionLocked = true;
    toggleFast.disabled = true;
    try { data.activeStart ? stopFast() : startFast(); }
    finally {
      setTimeout(() => {
        fastActionLocked = false;
        toggleFast.disabled = !!recoveryMode;
      }, 650);
    }
  });

  function showActiveTargetError(message) {
    const box = el('activeTargetError');
    box.textContent = message || '';
    box.hidden = !message;
  }

  function syncActiveTargetPresetState() {
    const current = parseLocalizedNumber(el('activeTargetInput').value);
    document.querySelectorAll('[data-active-goal]').forEach(btn => {
      const selected = Number.isFinite(current) && Number(btn.dataset.activeGoal) === current;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
  }

  function openActiveTargetModal() {
    if (!data.activeStart || recoveryMode) return;
    el('activeTargetInput').value = formatNumber(activeTargetHours(), 0, 3);
    showActiveTargetError('');
    syncActiveTargetPresetState();
    showModal('activeTargetModal', 'activeTargetInput');
  }

  function closeActiveTargetModal() {
    showActiveTargetError('');
    hideModal('activeTargetModal');
  }

  function applyActiveGoalValue(value) {
    if (!data.activeStart) return false;
    const next = sanitizeGoal(value, activeTargetHours());
    if (next === activeTargetHours()) { closeActiveTargetModal(); return true; }
    data.activeGoalHours = next;
    data.activeModifiedAt = new Date().toISOString();
    if (!save({ invalidateDerived:false, dirtyViews:['fasting','settings'] })) { renderAll(); return false; }
    closeActiveTargetModal();
    updateTimer();
    viewDirty.fasting = false;
    renderBackupStatus();
    return true;
  }

  function requestActiveGoalChange(value) {
    const parsed = parseLocalizedNumber(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_SAFE_GOAL_HOURS) {
      showActiveTargetError(t('activeTarget.errGoal'));
      return;
    }
    const next = sanitizeGoal(parsed, activeTargetHours());
    if (next >= LONG_FAST_NOTICE_HOURS && !longFastNoticeSeen()) {
      pendingLongFastGoal = next;
      pendingLongFastScope = 'active';
      closeActiveTargetModal();
      el('longFastModalText').textContent = t('safety.longFastText', { goal: formatGoal(next) });
      showModal('longFastModal', 'longFastCancelBtn');
      return;
    }
    applyActiveGoalValue(next);
  }

  function currentStreak() {
    if (currentStreakCache != null) return currentStreakCache;
    const sorted = [...data.records].sort((a, b) => new Date(b.end) - new Date(a.end));
    let streak = 0;
    for (const r of sorted) {
      if (!recordMetGoal(r)) break;
      streak++;
    }
    currentStreakCache = streak;
    return streak;
  }

  function updateToday() {
    const now = new Date();
    el('todayTotal').textContent = friendlyDuration(fastingMsForDay(now));
    const s = currentStreak();
    el('streakValue').textContent = t(pluralKey('fasting.fastCount', s), {n:s});
  }

  function renderHistory() {
    const box = el('historyList');
    box.replaceChildren();
    if (!data.records.length) {
      const empty = document.createElement('div');
      empty.className = 'historyEmpty';
      empty.textContent = t('history.empty');
      box.append(empty);
      return;
    }
    const sorted = [...data.records].sort((a, b) => new Date(b.end) - new Date(a.end));
    const visible = sorted.slice(0, historyVisibleCount);
    for (const r of visible) {
      const row = document.createElement('div'); row.className = 'row historyRow';
      const left = document.createElement('div'); left.style.minWidth = '0';
      const strong = document.createElement('strong'); strong.textContent = localDateLabel(r.end, r.timeZone); left.append(strong);
      const times = document.createElement('div'); times.className = 'small'; times.textContent = `${localDateTimeLabel(r.start, r.timeZone)} → ${localDateTimeLabel(r.end, r.timeZone)}`; left.append(times);
      const targetLine = document.createElement('div'); targetLine.className = 'small'; targetLine.textContent = t('history.target', {goal: formatGoal(r.goalHours ?? data.goalHours)}); left.append(targetLine);
      if (recordMetGoal(r)) {
        const badge = document.createElement('div'); badge.className = 'goalBadge'; badge.textContent = t('history.targetReached'); left.append(badge);
      }
      const right = document.createElement('div'); right.style.textAlign = 'right'; right.style.flex = '0 0 auto';
      const dur = document.createElement('div'); dur.className = 'duration'; dur.textContent = friendlyDuration(recordMs(r)); right.append(dur);
      const exactHours = recordMs(r) / 3600000; const exact = document.createElement('div'); exact.className = 'small'; exact.textContent = `${formatNumber(exactHours, 0, 2)}${t('unit.h')}`; right.append(exact);
      const actions = document.createElement('div'); actions.className = 'historyActions';
      const edit = document.createElement('button'); edit.className = 'secondary'; edit.textContent = t('common.edit'); edit.addEventListener('click', () => openEntryModal(r));
      const del = document.createElement('button'); del.className = 'dangerText'; del.textContent = t('common.delete'); del.addEventListener('click', () => {
        if (confirm(t('history.deleteConfirm'))) {
          data.records = data.records.filter(x => x.id !== r.id);
          save();
          renderAll();
        }
      });
      actions.append(edit, del); right.append(actions);
      row.append(left, right);
      box.append(row);
    }
    if (visible.length < sorted.length) {
      const wrap = document.createElement('div'); wrap.className = 'loadMoreWrap';
      const more = document.createElement('button'); more.className = 'secondary';
      more.textContent = t('common.loadMoreCount', {n: sorted.length - visible.length});
      more.addEventListener('click', () => { historyVisibleCount += HISTORY_PAGE_SIZE; renderHistory(); });
      wrap.append(more); box.append(wrap);
    }
  }

  function startOfWeek(dateLike = new Date()) {
    const d = new Date(dateLike);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function weekKey(dateLike, timeZone = currentTimeZone()) {
    const p=zonedParts(dateLike,timeZone); const d=new Date(Date.UTC(p.year,p.month-1,p.day));
    const day=d.getUTCDay(), diff=day===0?-6:1-day; d.setUTCDate(d.getUTCDate()+diff);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  }

  function successfulFastCount() {
    return data.records.filter(recordMetGoal).length;
  }

  function distinctWeightLoggingDays() {
    return new Set(data.weights.map(w => dayKey(w.when, w.timeZone))).size;
  }

  function gamificationXP() {
    return successfulFastCount() * 10 + distinctWeightLoggingDays() * 2;
  }

  function levelForXP(xp) {
    if (xp >= 350) return { number: 4, nameKey: 'game.level4', min: 350, next: null };
    if (xp >= 150) return { number: 3, nameKey: 'game.level3', min: 150, next: 350 };
    if (xp >= 50) return { number: 2, nameKey: 'game.level2', min: 50, next: 150 };
    return { number: 1, nameKey: 'game.level1', min: 0, next: 50 };
  }

  function weeklyTargetSuccessRate() {
    const currentWeek = weekKey(new Date(), currentTimeZone());
    const records = data.records.filter(r => weekKey(r.end, r.timeZone || currentTimeZone()) === currentWeek);
    if (!records.length) return null;
    return Math.round((records.filter(recordMetGoal).length / records.length) * 100);
  }

  function weightWeekStreak() {
    const weeks = new Set(data.weights.map(w => weekKey(w.when, w.timeZone)));
    if (!weeks.size) return 0;
    let cursor = startOfWeek();
    if (!weeks.has(dayKey(cursor))) {
      cursor.setDate(cursor.getDate() - 7);
      if (!weeks.has(dayKey(cursor))) return 0;
    }
    let streak = 0;
    while (weeks.has(dayKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 7);
    }
    return streak;
  }

  function hasComebackAchievement() {
    const sorted = [...data.records].sort((a, b) => new Date(a.end) - new Date(b.end));
    for (let i = 1; i < sorted.length; i++) {
      if (!recordMetGoal(sorted[i - 1]) && recordMetGoal(sorted[i])) return true;
    }
    return false;
  }

  function achievementDefinitions() {
    const wins = successfulFastCount();
    const weightStreak = weightWeekStreak();
    const backupFresh = !!validDate(backupMeta.lastExternalBackupAt) && !backupIsDue();
    return [
      { icon: '✓', title: t('game.ach1'), detail: t('game.ach1d'), unlocked: wins >= 1 },
      { icon: '5', title: t('game.ach5'), detail: t('game.ach5d'), unlocked: wins >= 5 },
      { icon: '10', title: t('game.ach10'), detail: t('game.ach10d'), unlocked: wins >= 10 },
      { icon: '25', title: t('game.ach25'), detail: t('game.ach25d'), unlocked: wins >= 25 },
      { icon: '50', title: t('game.ach50'), detail: t('game.ach50d'), unlocked: wins >= 50 },
      { icon: '↗', title: t('game.comeback'), detail: t('game.comebackd'), unlocked: hasComebackAchievement() },
      { icon: '⚖', title: t('game.weightHabit'), detail: t('game.weightHabitd'), unlocked: weightStreak >= 4 },
      { icon: '⇩', title: t('game.backupKeeper'), detail: t('game.backupKeeperd'), unlocked: backupFresh }
    ];
  }

  function renderGamification() {
    const enabled = data.gamificationEnabled !== false;
    const summary = el('gamificationSummary');
    const detail = el('gamificationDetail');
    if (summary) summary.hidden = !enabled;
    if (detail) detail.hidden = !enabled;
    const toggle = el('gamificationToggle');
    if (toggle) toggle.checked = enabled;
    if (!enabled) return;

    const xp = gamificationXP();
    const level = levelForXP(xp);
    const levelLabel = t('game.levelFull', {n: level.number, name: t(level.nameKey)});
    el('gSummaryLevel').textContent = t('game.level', {n: level.number});
    el('gDetailLevel').textContent = levelLabel;
    el('gSummaryXP').textContent = `${formatNumber(xp)} XP`;
    el('gXP').textContent = formatNumber(xp);

    let fillPct = 100;
    if (level.next != null) {
      fillPct = ((xp - level.min) / (level.next - level.min)) * 100;
      el('gSummaryNext').textContent = t('game.next', {xp: Math.max(0, level.next - xp)});
    } else {
      el('gSummaryNext').textContent = t('game.highest');
    }
    const safeFillPct = Math.max(0, Math.min(100, fillPct));
    el('gSummaryFill').style.width = `${safeFillPct}%`;
    el('xpProgressTrack').setAttribute('aria-valuenow', String(Math.round(safeFillPct)));
    el('xpProgressTrack').setAttribute('aria-valuetext', level.next == null ? t('game.highest') : t('game.next', {xp: Math.max(0, level.next - xp)}));

    const weekly = weeklyTargetSuccessRate();
    el('gWeekly').textContent = weekly == null ? '—' : `${weekly}%`;
    el('gWeightStreak').textContent = formatNumber(weightWeekStreak());

    const box = el('achievementBadges');
    box.replaceChildren();
    for (const achievement of achievementDefinitions()) {
      const item = document.createElement('div');
      item.className = `achievementBadge ${achievement.unlocked ? 'unlocked' : 'locked'}`;
      item.setAttribute('role', 'group');
      item.setAttribute('aria-label', `${achievement.title}: ${t(achievement.unlocked ? 'game.unlocked' : 'game.locked')}. ${achievement.detail}`);
      const icon = document.createElement('div'); icon.className = 'badgeIcon'; icon.textContent = achievement.icon;
      const title = document.createElement('strong'); title.textContent = achievement.title;
      const detailText = document.createElement('div'); detailText.className = 'small'; detailText.textContent = achievement.detail;
      item.append(icon, title, detailText);
      box.append(item);
    }
  }

  function statsSummary() {
    if (statsSummaryCache) return statsSummaryCache;
    const ms = data.records.map(recordMs), total = ms.reduce((a, b) => a + b, 0);
    statsSummaryCache = {
      count: ms.length,
      total,
      average: ms.length ? total / ms.length : 0,
      longest: ms.length ? Math.max(...ms) : 0,
      goalCount: data.records.filter(recordMetGoal).length,
      streak: currentStreak()
    };
    return statsSummaryCache;
  }

  function renderStats() {
    const summary = statsSummary();
    el('mTotal').textContent = formatNumber(summary.count);
    el('mAverage').textContent = summary.count ? compactDuration(summary.average) : `0${t('unit.h')}`;
    el('mLongest').textContent = summary.count ? compactDuration(summary.longest) : `0${t('unit.h')}`;
    el('mGoal').textContent = formatNumber(summary.goalCount);
    el('mStreak').textContent = formatNumber(summary.streak);
    el('mHours').textContent = summary.total ? compactDuration(summary.total) : `0${t('unit.h')}`;
    renderStatsVisualizations();
    renderGamification();
  }

  function allFastingIntervals() {
    const intervals = data.records.map(r => ({ start: new Date(r.start).getTime(), end: new Date(r.end).getTime() }));
    if (data.activeStart) intervals.push({ start: new Date(data.activeStart).getTime(), end: Date.now() });
    return intervals.filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start).sort((a, b) => a.start - b.start);
  }

  function currentZoneDaySummaries(timeZone = currentTimeZone()) {
    const tz = normalizeTimeZone(timeZone);
    if (currentZoneDaySummaryCache?.timeZone === tz) return currentZoneDaySummaryCache.map;
    const map = new Map();
    for (const interval of allFastingIntervals()) {
      let cursor = interval.start, guard = 0;
      while (cursor < interval.end && guard++ < 10000) {
        const key = dayKey(cursor, tz);
        const boundary = Math.min(interval.end, nextZonedDayBoundary(cursor, tz));
        const item = map.get(key) || { totalFastMs:0, fastCount:0 };
        item.totalFastMs += Math.max(0, boundary - cursor);
        item.fastCount += 1;
        map.set(key, item);
        cursor = Math.max(boundary, cursor + 1);
      }
    }
    currentZoneDaySummaryCache = { timeZone:tz, map };
    return map;
  }

  function buildInteractiveChartDays(dayCount = 14, timeZone = currentTimeZone()) {
    const tz = normalizeTimeZone(timeZone);
    const intervals = allFastingIntervals();
    const days = [];
    for (let i = dayCount - 1; i >= 0; i--) {
      const anchor = new Date();
      anchor.setHours(12, 0, 0, 0);
      anchor.setDate(anchor.getDate() - i);
      const key = dayKey(anchor, tz);
      const start = zonedLocalToDate(`${key}T00:00`, tz);
      if (!start) continue;
      const startMs = start.getTime();
      const endMs = nextZonedDayBoundary(startMs, tz);
      const segments = [];
      let cursor = startMs;
      let fastCount = 0;
      let totalFastMs = 0;
      for (const interval of intervals) {
        if (interval.end <= startMs) continue;
        if (interval.start >= endMs) break;
        const segStart = Math.max(startMs, interval.start);
        const segEnd = Math.min(endMs, interval.end);
        if (segStart > cursor) {
          segments.push({ type: 'gap', start: cursor, end: segStart, index: segments.length });
        }
        if (segEnd > segStart) {
          segments.push({ type: 'fast', start: segStart, end: segEnd, index: segments.length });
          totalFastMs += segEnd - segStart;
          fastCount += 1;
        }
        cursor = Math.max(cursor, segEnd);
      }
      if (cursor < endMs) segments.push({ type: 'gap', start: cursor, end: endMs, index: segments.length });
      days.push({ key, startMs, endMs, totalFastMs, fastCount, segments, timeZone: tz, label: localDateLabel(startMs, tz) });
    }
    return days;
  }

  function chartTimeWithinDayLabel(ms, dayEndMs, timeZone) {
    if (Math.abs(ms - dayEndMs) < 1000) return '24:00';
    const parts = zonedParts(ms, timeZone);
    return `${pad(parts.hour)}:${pad(parts.minute)}`;
  }

  function chartSelectionDetail(days) {
    if (!chartSelectedTarget) return null;
    const day = days.find(item => item.key === chartSelectedTarget.dayKey);
    if (!day) return null;
    if (chartSelectedTarget.kind === 'day') {
      return {
        title: day.label,
        text: t('stats.detailTotal', { duration: compactDuration(day.totalFastMs), count: formatNumber(day.fastCount) })
      };
    }
    const segment = day.segments[chartSelectedTarget.segmentIndex];
    if (!segment) return null;
    const start = chartTimeWithinDayLabel(segment.start, day.endMs, day.timeZone);
    const end = chartTimeWithinDayLabel(segment.end, day.endMs, day.timeZone);
    return {
      title: day.label,
      text: t(segment.type === 'fast' ? 'stats.detailFast' : 'stats.detailGap', { start, end, duration: compactDuration(segment.end - segment.start) })
    };
  }

  function renderChartDetail(days = null) {
    if (statsVizMode === 'timeline') renderChartDetailForMode(days);
  }

  function hitTestChart(clientX, clientY) {
    const c = el('chart');
    const rect = c.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const g = timelineChartGeometry;
    if (!g || !timelineChartDays.length) return null;

    // Use the whole day cell (bar plus half of each inter-column gap) as the
    // horizontal touch target. This is much easier to hit than the narrow
    // painted bar on a phone while still selecting the intended date.
    const firstCenter = g.left + g.bw / 2;
    const index = Math.round((x - firstCenter) / g.slot);
    if (index < 0 || index >= timelineChartDays.length) return null;
    const center = firstCenter + index * g.slot;
    if (Math.abs(x - center) > g.slot / 2) return null;
    const day = timelineChartDays[index];

    // Tapping the date-label strip selects the whole day.
    if (y >= g.top + g.h && y <= g.cssH) return { kind:'day', dayKey:day.key };
    if (y < g.top || y > g.top + g.h) return null;

    // Map the vertical touch position directly to clock time, then find the
    // corresponding fasting or non-fasting segment. Every point in the 24 h
    // column therefore has a selectable segment, even if that segment is only
    // a few pixels tall visually.
    const fraction = Math.max(0, Math.min(0.999999, (y - g.top) / g.h));
    const instant = day.startMs + fraction * (day.endMs - day.startMs);
    let segmentIndex = day.segments.findIndex(seg => instant >= seg.start && instant < seg.end);
    if (segmentIndex < 0 && day.segments.length) segmentIndex = day.segments.length - 1;
    return segmentIndex >= 0 ? { kind:'segment', dayKey:day.key, segmentIndex } : { kind:'day', dayKey:day.key };
  }

  function selectTimelineAt(clientX, clientY) {
    const hit = hitTestChart(clientX, clientY);
    if (!hit) return false;
    statsDetailOverride = null;
    if (hit.kind === 'day') chartSelectedTarget = { kind:'day', dayKey:hit.dayKey };
    else chartSelectedTarget = { kind:'segment', dayKey:hit.dayKey, segmentIndex:hit.segmentIndex };
    drawChart(timelineChartDays);
    return true;
  }

  function beginTimelinePointer(event) {
    // Pointer Events avoid iOS's delayed synthetic click path. We keep the
    // press pending so a horizontal swipe can still scroll the timeline.
    timelinePointerStart = { id:event.pointerId, x:event.clientX, y:event.clientY, moved:false };
  }

  function moveTimelinePointer(event) {
    const start = timelinePointerStart;
    if (!start || start.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) start.moved = true;
  }

  function finishTimelinePointer(event) {
    const start = timelinePointerStart;
    timelinePointerStart = null;
    if (!start || start.id !== event.pointerId || start.moved) return;
    selectTimelineAt(event.clientX, event.clientY);
  }

  function cancelTimelinePointer(event) {
    if (!timelinePointerStart || timelinePointerStart.id === event.pointerId) timelinePointerStart = null;
  }

  function scrollTimelineToLatest({ force = false } = {}) {
    const scroller = el('timelineScroller');
    if (!scroller) return false;
    if (!force && !timelineScrollToLatestPending) return true;
    if (timelineScrollFrame) cancelAnimationFrame(timelineScrollFrame);
    timelineScrollFrame = requestAnimationFrame(() => {
      timelineScrollFrame = 0;
      if (!scroller.isConnected || scroller.clientWidth <= 0) return;
      const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      scroller.scrollLeft = maxScroll;
      // iOS can update the scrollable width one paint later after a hidden
      // statistics panel becomes visible. Repeat once to guarantee the newest
      // day is flush with the right-hand time axis.
      requestAnimationFrame(() => {
        if (!scroller.isConnected || scroller.clientWidth <= 0) return;
        scroller.scrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        timelineScrollToLatestPending = false;
      });
    });
    return true;
  }

  function drawChart(daysOverride = null) {
    const c = el('chart'), ctx = c.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || 700, cssH = c.clientHeight || 310;
    c.width = Math.floor(cssW * ratio); c.height = Math.floor(cssH * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    c.style.touchAction = 'pan-x';

    const days = Array.isArray(daysOverride) && daysOverride.length ? daysOverride : buildInteractiveChartDays(14);
    const top = 18, bottom = 38, left = 6, right = 6;
    const w = cssW - left - right, h = cssH - top - bottom;
    const gap = 8, bw = (w - gap * 13) / 14;
    const slot = bw + gap;
    timelineChartDays = days;
    timelineChartGeometry = { top, bottom, left, right, w, h, gap, bw, slot, cssW, cssH };
    const style = getComputedStyle(document.documentElement);
    const line = style.getPropertyValue('--line').trim();
    const accent = style.getPropertyValue('--accent').trim();
    const muted = style.getPropertyValue('--muted').trim();
    const card = style.getPropertyValue('--card').trim();
    const textColor = style.getPropertyValue('--text').trim();
    chartInteractiveLayout = [];

    ctx.strokeStyle = line; ctx.lineWidth = 1;
    [0, 6, 12, 18, 24].forEach(hour => {
      const frac = hour / 24;
      const y = top + h * frac;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(cssW - right, y); ctx.stroke();
    });

    days.forEach((day, i) => {
      const x0 = left + i * (bw + gap);
      const isDaySelected = chartSelectedTarget && chartSelectedTarget.kind === 'day' && chartSelectedTarget.dayKey === day.key;
      ctx.fillStyle = card;
      ctx.fillRect(x0, top, bw, h);
      ctx.strokeStyle = isDaySelected ? textColor : line;
      ctx.lineWidth = isDaySelected ? 4 : 1;
      ctx.strokeRect(x0, top, bw, h);
      if (isDaySelected) {
        ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(x0 + 2, top + 2, Math.max(1,bw - 4), Math.max(1,h - 4));
      }
      chartInteractiveLayout.push({ kind: 'day', dayKey: day.key, x: x0, y: cssH - bottom + 4, w: bw, h: bottom - 4 });

      day.segments.forEach((segment, segIndex) => {
        const segTop = top + ((segment.start - day.startMs) / (day.endMs - day.startMs)) * h;
        const segHeight = Math.max(2, ((segment.end - segment.start) / (day.endMs - day.startMs)) * h);
        const rectY = Math.min(top + h - 2, segTop);
        const rectH = Math.min(h, segHeight);
        chartInteractiveLayout.push({ kind: 'segment', dayKey: day.key, segmentIndex: segIndex, x: x0 - gap/2, y: rectY, w: bw + gap, h: rectH });
        if (segment.type === 'fast') {
          ctx.fillStyle = accent;
          ctx.globalAlpha = .88;
          ctx.fillRect(x0 + 1, rectY + 1, Math.max(1, bw - 2), Math.max(1, rectH - 2));
          ctx.globalAlpha = 1;
        }
        const isSelected = chartSelectedTarget && chartSelectedTarget.kind === 'segment' && chartSelectedTarget.dayKey === day.key && chartSelectedTarget.segmentIndex === segIndex;
        if (isSelected) {
          // High-contrast outer border + accent inner border make selection
          // obvious on both filled fasting segments and empty non-fasting gaps.
          const sx = x0 + 1, sy = rectY + 1, sw = Math.max(1, bw - 2), sh = Math.max(1, rectH - 2);
          ctx.save();
          ctx.fillStyle = textColor; ctx.globalAlpha = .12; ctx.fillRect(sx, sy, sw, sh); ctx.globalAlpha = 1;
          ctx.strokeStyle = textColor; ctx.lineWidth = 4; ctx.strokeRect(sx, sy, sw, sh);
          if (sw > 5 && sh > 5) { ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(sx + 2, sy + 2, Math.max(1, sw - 4), Math.max(1, sh - 4)); }
          ctx.restore();
        }
      });

      const dp = zonedParts(day.startMs, day.timeZone);
      ctx.fillStyle = muted; ctx.font = '11px -apple-system'; ctx.textAlign = 'center';
      ctx.fillText(formatNumber(dp.day), x0 + bw / 2, cssH - 11);
    });
    ctx.textAlign = 'start';
    renderChartDetail(days);
    scrollTimelineToLatest();
  }

  function setStatsDetail(title, text) {
    statsDetailOverride = title || text ? { title: title || t('stats.chartDetailDefaultTitle'), text: text || '' } : null;
    renderChartDetailForMode();
  }

  function defaultStatsHelpKey() {
    return statsVizMode === 'calendar' ? 'stats.calendarHelp' : statsVizMode === 'trend' ? 'stats.trendHelp' : statsVizMode === 'weeks' ? 'stats.weeksHelp' : 'stats.timelineHelp';
  }

  function renderChartDetailForMode(days = null) {
    const title = el('chartDetailTitle'), text = el('chartDetailText');
    if (!title || !text) return;
    let detail = statsDetailOverride;
    if (!detail && statsVizMode === 'timeline' && days) detail = chartSelectionDetail(days);
    title.textContent = detail?.title || t('stats.chartDetailDefaultTitle');
    text.textContent = detail?.text || t('stats.chartDetailDefaultText');
    const help = el('statsVizHelp'); if (help) help.textContent = t(defaultStatsHelpKey());
  }

  function activateStatsVizControl(target) {
    const button = target?.closest?.('#statsVizSwitcher [data-viz]');
    if (!button) return false;
    button.classList.add('pressed');
    setTimeout(() => button.classList.remove('pressed'), 100);
    setStatsVizMode(button.dataset.viz);
    return true;
  }

  function handleStatsVizPointerDown(event) {
    if (!activateStatsVizControl(event.target)) return;
    statsVizPointerStamp = performance.now();
    // Pointer Events are the single touch/mouse path. Preventing the later
    // compatibility click avoids duplicate work on iOS standalone PWAs.
    if (event.cancelable) event.preventDefault();
  }

  function handleStatsVizClick(event) {
    // Keep keyboard activation (detail === 0) and old-browser fallback only.
    if (event.detail !== 0 && performance.now() - statsVizPointerStamp < 700) return;
    activateStatsVizControl(event.target);
  }

  function showStatsVizView(mode) {
    const map = { timeline:'statsTimelineView', calendar:'statsCalendarView', trend:'statsTrendView', weeks:'statsWeeksView' };
    for (const [key,id] of Object.entries(map)) el(id).hidden = key !== mode;
  }

  function renderStatsVisualizationMode(mode = statsVizMode) {
    if (mode === 'calendar') renderFastCalendar();
    else if (mode === 'trend') drawFastTrendChart();
    else if (mode === 'weeks') drawFastWeeksChart();
    else drawChart();
    statsVizRendered.add(mode);
  }

  function scheduleStatsVizRender(mode) {
    const requestedMode = mode;
    const token = ++statsVizRenderFrame;
    if (statsVizRenderTimer) { clearTimeout(statsVizRenderTimer); statsVizRenderTimer = 0; }

    // A single requestAnimationFrame still runs before the browser paints, so
    // expensive chart work in that callback can hide the tab change. Schedule
    // the work as a timer from the frame callback: the browser gets one paint
    // with the newly selected tab/view before any chart calculation begins.
    requestAnimationFrame(() => {
      if (token !== statsVizRenderFrame || statsVizMode !== requestedMode) return;
      statsVizRenderTimer = setTimeout(() => {
        statsVizRenderTimer = 0;
        if (token !== statsVizRenderFrame || statsVizMode !== requestedMode) return;
        renderStatsVisualizationMode(requestedMode);
        renderChartDetailForMode();
      }, 0);
    });
  }

  function setStatsVizMode(mode) {
    const allowed = ['timeline','calendar','trend','weeks'];
    const nextMode = allowed.includes(mode) ? mode : 'timeline';
    if (statsVizMode === nextMode) return;
    statsVizMode = nextMode;
    statsDetailOverride = null;
    if (statsVizMode === 'timeline') timelineScrollToLatestPending = true;
    document.querySelectorAll('#statsVizSwitcher [data-viz]').forEach(btn => {
      const active = btn.dataset.viz === statsVizMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    // Switch the panel and explanatory copy immediately. If this mode was
    // already rendered for the current data revision, no chart work is needed
    // at all, making repeat switches effectively instantaneous.
    showStatsVizView(statsVizMode);
    renderChartDetailForMode();
    if (!statsVizRendered.has(statsVizMode) || data.activeStart) scheduleStatsVizRender(statsVizMode);
  }

  function renderStatsVisualizations() {
    // Data changes invalidate the render cache. Render only the visible mode;
    // other modes are rendered lazily after their tab has already painted.
    renderStatsVisualizationMode(statsVizMode);
  }

  function monthAnchor(offset = 0) {
    const d = new Date(); d.setHours(12,0,0,0); d.setDate(1); d.setMonth(d.getMonth() + offset); return d;
  }

  function chartDayForAnchor(anchor, timeZone = currentTimeZone(), summaries = currentZoneDaySummaries(timeZone)) {
    const tz = normalizeTimeZone(timeZone), key = dayKey(anchor, tz);
    const start = zonedLocalToDate(`${key}T00:00`, tz);
    if (!start) return null;
    const startMs = start.getTime(), endMs = nextZonedDayBoundary(startMs, tz);
    const summary = summaries.get(key) || { totalFastMs:0, fastCount:0 };
    return { key, startMs, endMs, totalFastMs:summary.totalFastMs, fastCount:summary.fastCount, timeZone:tz, label:localDateLabel(startMs,tz) };
  }

  function calendarLevel(ms) {
    const hours = Math.max(0, ms) / 3600000;
    if (hours <= 0) return 0;
    if (hours < 6) return 1;
    if (hours < 12) return 2;
    if (hours < 18) return 3;
    return 4;
  }

  function weekdayLabelsMondayFirst() {
    const base = new Date(2026, 0, 5, 12, 0, 0, 0); // Monday
    return Array.from({length:7},(_,i)=>new Date(base.getTime()+i*86400000).toLocaleDateString(currentLocale(),{weekday:'narrow'}));
  }

  function renderFastCalendar() {
    const title=el('calendarMonthTitle'), grid=el('fastCalendar'), heads=el('calendarWeekdays');
    if (!title || !grid || !heads) return;
    const month=monthAnchor(statsCalendarMonthOffset), monthIndex=month.getMonth(), now=new Date();
    title.textContent=month.toLocaleDateString(currentLocale(),{month:'long',year:'numeric'});
    el('calendarNextBtn').disabled = statsCalendarMonthOffset >= 0;
    heads.replaceChildren();
    for (const label of weekdayLabelsMondayFirst()) { const node=document.createElement('div'); node.className='calendarWeekday'; node.textContent=label; heads.append(node); }
    const first=new Date(month); const shift=(first.getDay()+6)%7; first.setDate(first.getDate()-shift);
    const tz=currentTimeZone(), cacheKey=`${statsCalendarMonthOffset}|${tz}`;
    let calendarDays=calendarDaysCache.get(cacheKey);
    if (!calendarDays) {
      const summaries=currentZoneDaySummaries(tz);
      calendarDays=[];
      for (let i=0;i<42;i++) {
        const d=new Date(first); d.setDate(first.getDate()+i); d.setHours(12,0,0,0);
        const day=chartDayForAnchor(d,tz,summaries);
        if (day) calendarDays.push({d,day});
      }
      calendarDaysCache.set(cacheKey,calendarDays);
    }
    grid.replaceChildren();
    for (const {d,day} of calendarDays) {
      const btn=document.createElement('button'); btn.type='button'; btn.className=`calendarDay level${calendarLevel(day.totalFastMs)}`;
      const outside=d.getMonth()!==monthIndex, future=d.getTime()>now.getTime()+12*3600000;
      if (outside) btn.classList.add('outside'); if (future) btn.classList.add('future');
      if (statsDetailOverride?.dayKey===day.key) btn.classList.add('selected');
      btn.disabled=future; btn.dataset.dayKey=day.key;
      const n=document.createElement('span'); n.textContent=formatNumber(d.getDate());
      const h=document.createElement('span'); h.className='calendarHours'; h.textContent=day.totalFastMs ? compactDuration(day.totalFastMs) : '—';
      btn.append(n,h);
      btn.setAttribute('aria-label',`${day.label}: ${compactDuration(day.totalFastMs)}`);
      const selectCalendarDay=()=>{ statsDetailOverride={dayKey:day.key,title:day.label,text:t('stats.detailTotal',{duration:compactDuration(day.totalFastMs),count:formatNumber(day.fastCount)})}; grid.querySelectorAll('.calendarDay.selected').forEach(node=>node.classList.remove('selected')); btn.classList.add('selected'); renderChartDetailForMode(); };
      btn.addEventListener('pointerdown',event=>{ selectCalendarDay(); if(event.cancelable) event.preventDefault(); });
      btn.addEventListener('click',event=>{ if(event.detail===0) selectCalendarDay(); });
      grid.append(btn);
    }
    renderChartDetailForMode();
  }

  function buildSummaryChartDays(dayCount = 30, timeZone = currentTimeZone()) {
    const tz = normalizeTimeZone(timeZone), summaries = currentZoneDaySummaries(tz), days = [];
    for (let i = dayCount - 1; i >= 0; i--) {
      const anchor = new Date(); anchor.setHours(12,0,0,0); anchor.setDate(anchor.getDate() - i);
      const day = chartDayForAnchor(anchor, tz, summaries);
      if (day) days.push(day);
    }
    return days;
  }

  function drawFastTrendChart() {
    const c=el('fastTrendChart'), ctx=c.getContext('2d'), ratio=window.devicePixelRatio||1;
    const cssW=c.clientWidth||660, cssH=260; c.width=Math.floor(cssW*ratio); c.height=Math.floor(cssH*ratio); ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,cssW,cssH);
    const days=trendChartDaysCache || (trendChartDaysCache=buildSummaryChartDays(30)), top=18,bottom=34,left=34,right=10,w=cssW-left-right,h=cssH-top-bottom;
    const style=getComputedStyle(document.documentElement), line=style.getPropertyValue('--line').trim(),accent=style.getPropertyValue('--accent').trim(),muted=style.getPropertyValue('--muted').trim();
    ctx.strokeStyle=line; ctx.fillStyle=muted; ctx.font='10px -apple-system'; ctx.textAlign='right';
    [0,6,12,18,24].forEach(hour=>{const y=top+h-(hour/24)*h;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(cssW-right,y);ctx.stroke();ctx.fillText(`${hour}${t('unit.h')}`,left-5,y+3);});
    trendInteractiveLayout=[]; ctx.strokeStyle=accent; ctx.lineWidth=2; ctx.beginPath();
    days.forEach((day,i)=>{const x=left+(i/(Math.max(1,days.length-1)))*w,y=top+h-(Math.min(24,day.totalFastMs/3600000)/24)*h;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}); ctx.stroke();
    days.forEach((day,i)=>{const x=left+(i/(Math.max(1,days.length-1)))*w,y=top+h-(Math.min(24,day.totalFastMs/3600000)/24)*h;const selected=trendSelectedDayKey===day.key;ctx.beginPath();ctx.arc(x,y,selected?6:3,0,Math.PI*2);ctx.fillStyle=selected?'#ffffff':accent;ctx.fill();if(selected){ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.stroke();}trendInteractiveLayout.push({day,x,y,r:14}); if(i%5===0||i===days.length-1){ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='center';ctx.fillText(formatNumber(new Date(day.startMs).getDate()),x,cssH-10);}});
    renderChartDetailForMode();
  }

  function handleTrendPointer(event) {
    const c=el('fastTrendChart'), rect=c.getBoundingClientRect(), x=event.clientX-rect.left,y=event.clientY-rect.top;
    let best=null,bestD=Infinity; for(const hit of trendInteractiveLayout){const d=Math.hypot(x-hit.x,y-hit.y);if(d<bestD){bestD=d;best=hit;}}
    if(!best||bestD>18)return; trendSelectedDayKey=best.day.key; statsDetailOverride={dayKey:best.day.key,title:best.day.label,text:t('stats.detailTotal',{duration:compactDuration(best.day.totalFastMs),count:formatNumber(best.day.fastCount)})}; drawFastTrendChart();
  }

  function startOfWeekMonday(date) { const d=new Date(date); d.setHours(12,0,0,0); const shift=(d.getDay()+6)%7; d.setDate(d.getDate()-shift); return d; }

  function buildWeeklySummaries() {
    if (weeklySummariesCache) return weeklySummariesCache;
    const tz=currentTimeZone(), summaries=currentZoneDaySummaries(tz), thisMonday=startOfWeekMonday(new Date()), weeks=[];
    for(let wi=7;wi>=0;wi--){const start=new Date(thisMonday);start.setDate(start.getDate()-wi*7);let total=0,daysWithFast=0;for(let di=0;di<7;di++){const d=new Date(start);d.setDate(start.getDate()+di);const day=chartDayForAnchor(d,tz,summaries);if(day){total+=day.totalFastMs;if(day.totalFastMs>0)daysWithFast++;}}const key=dayKey(start,tz);weeks.push({key,start,totalFastMs:total,daysWithFast,label:start.toLocaleDateString(currentLocale(),{day:'numeric',month:'short'})});}
    weeklySummariesCache=weeks;
    return weeklySummariesCache;
  }

  function drawFastWeeksChart() {
    const c=el('fastWeeksChart'),ctx=c.getContext('2d'),ratio=window.devicePixelRatio||1,cssW=c.clientWidth||660,cssH=260;c.width=Math.floor(cssW*ratio);c.height=Math.floor(cssH*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,cssW,cssH);
    const weeks=buildWeeklySummaries(),top=18,bottom=34,left=38,right=8,w=cssW-left-right,h=cssH-top-bottom,maxH=Math.max(24,...weeks.map(x=>x.totalFastMs/3600000));
    const style=getComputedStyle(document.documentElement),line=style.getPropertyValue('--line').trim(),accent=style.getPropertyValue('--accent').trim(),muted=style.getPropertyValue('--muted').trim();ctx.strokeStyle=line;ctx.lineWidth=1;
    [0,.5,1].forEach(frac=>{const y=top+h-h*frac;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(cssW-right,y);ctx.stroke();ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='right';ctx.fillText(`${formatNumber(maxH*frac,0,0)}${t('unit.h')}`,left-5,y+3);});
    const gap=8,bw=(w-gap*7)/8;weekInteractiveLayout=[];weeks.forEach((week,i)=>{const hours=week.totalFastMs/3600000,bh=(hours/maxH)*h,x=left+i*(bw+gap),y=top+h-bh;ctx.fillStyle=accent;ctx.globalAlpha=.86;ctx.fillRect(x,y,bw,bh);ctx.globalAlpha=1;if(weekSelectedKey===week.key){const sy=Math.max(top,y-3),sh=Math.min(h,bh+6);ctx.strokeStyle='#ffffff';ctx.lineWidth=4;ctx.strokeRect(x-3,sy,bw+6,sh);ctx.strokeStyle=accent;ctx.lineWidth=1.5;ctx.strokeRect(x-1,Math.max(top,y-1),bw+2,Math.min(h,bh+2));}ctx.fillStyle=muted;ctx.font='9px -apple-system';ctx.textAlign='center';ctx.fillText(week.label,x+bw/2,cssH-10);weekInteractiveLayout.push({week,x,y:top,w:bw,h});});renderChartDetailForMode();
  }

  function handleWeeksPointer(event) { const c=el('fastWeeksChart'),rect=c.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;const hit=weekInteractiveLayout.find(item=>x>=item.x&&x<=item.x+item.w&&y>=item.y&&y<=item.y+item.h);if(!hit)return;weekSelectedKey=hit.week.key;statsDetailOverride={dayKey:hit.week.key,title:t('stats.weekOf',{date:hit.week.label}),text:t('stats.detailWeek',{duration:compactDuration(hit.week.totalFastMs),days:formatNumber(hit.week.daysWithFast)})};drawFastWeeksChart(); }

  function toLocalInputValue(dateLike, timeZone = currentTimeZone()) {
    const d = new Date(dateLike); if (!Number.isFinite(d.getTime())) return '';
    const p=zonedParts(d,timeZone);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
  }

  function showEntryError(message) {
    const box = el('entryError');
    box.textContent = message;
    box.hidden = !message;
  }

  function closeEntryModal() {
    hideModal('entryModal');
    editingRecordId = null;
    editingRecordTimeZone = null;
    showEntryError('');
  }

  function openEntryModal(record = null) {
    editingRecordId = record?.id || null;
    editingRecordTimeZone = record ? normalizeTimeZone(record.timeZone) : currentTimeZone();
    el('entryModalTitle').textContent = record ? t('history.editTitle') : t('history.addTitle');
    if (record) {
      el('entryStart').value = toLocalInputValue(record.start, editingRecordTimeZone);
      el('entryEnd').value = toLocalInputValue(record.end, editingRecordTimeZone);
      el('entryGoal').value = formatNumber(record.goalHours ?? data.goalHours, 0, 3);
    } else {
      const end = new Date();
      const start = new Date(end.getTime() - goalMs(data.goalHours));
      el('entryStart').value = toLocalInputValue(start);
      el('entryEnd').value = toLocalInputValue(end);
      el('entryGoal').value = formatNumber(data.goalHours, 0, 3);
    }
    showEntryError('');
    showModal('entryModal', 'entryStart');
  }

  function intervalOverlaps(start, end, excludeId = null) {
    const s = start.getTime(), e = end.getTime();
    for (const r of data.records) {
      if (r.id === excludeId) continue;
      const rs = new Date(r.start).getTime(), re = new Date(r.end).getTime();
      if (s < re && e > rs) return true;
    }
    if (data.activeStart) {
      const as = new Date(data.activeStart).getTime(), ae = Date.now();
      if (s < ae && e > as) return true;
    }
    return false;
  }

  function saveManualEntry() {
    const tz = editingRecordTimeZone || currentTimeZone();
    const start = zonedLocalToDate(el('entryStart').value, tz);
    const end = zonedLocalToDate(el('entryEnd').value, tz);
    const target = parseLocalizedNumber(el('entryGoal').value);
    if (!start || !end) { showEntryError(t('history.errDates')); return; }
    if (end <= start) { showEntryError(t('history.errEndAfter')); return; }
    if (end.getTime() > Date.now() + 60000) { showEntryError(t('history.errFuture')); return; }
    if (end - start < 60000) { showEntryError(t('history.errMinute')); return; }
    if (!Number.isFinite(target) || target <= 0) { showEntryError(t('history.errGoal')); return; }
    if (intervalOverlaps(start, end, editingRecordId)) { showEntryError(t('history.errOverlap')); return; }

    const existingRecord = editingRecordId ? data.records.find(r => r.id === editingRecordId) : null;
    const nowAudit = new Date().toISOString();
    const record = {
      id: editingRecordId || makeId(),
      start: start.toISOString(),
      end: end.toISOString(),
      goalHours: sanitizeGoal(target, data.goalHours),
      timeZone: tz,
      createdAt: existingRecord ? normalizeAuditTimestamp(existingRecord.createdAt) : nowAudit,
      modifiedAt: existingRecord ? nowAudit : null
    };
    if (editingRecordId) data.records = data.records.map(r => r.id === editingRecordId ? record : r);
    else data.records.push(record);
    if (!save()) { renderAll(); return; }
    closeEntryModal();
    renderAll();
  }

  function bindResponsiveAction(node, handler) {
    if (!node || typeof handler !== 'function') return;
    let pointerHandledAt = 0;
    let pointerStart = null;
    const flash = () => {
      node.classList.add('fastActionPressed');
      setTimeout(() => node.classList.remove('fastActionPressed'), 90);
    };
    node.addEventListener('pointerdown', event => {
      if (event.button != null && event.button !== 0) return;
      pointerStart = { id:event.pointerId, x:event.clientX, y:event.clientY };
      node.classList.add('fastActionPressed');
    });
    node.addEventListener('pointercancel', () => { pointerStart = null; node.classList.remove('fastActionPressed'); });
    node.addEventListener('pointerup', event => {
      const start = pointerStart;
      pointerStart = null;
      node.classList.remove('fastActionPressed');
      if (!start || start.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
      pointerHandledAt = performance.now();
      if (event.cancelable) event.preventDefault();
      flash();
      handler(event);
    });
    node.addEventListener('click', event => {
      if (event.detail !== 0 && performance.now() - pointerHandledAt < 700) { event.preventDefault(); return; }
      flash();
      handler(event);
    });
  }

  function scheduleWeightUiRefresh() {
    // Let a modal close / deleted row disappear before rebuilding summaries,
    // history and the weight chart.
    requestAnimationFrame(() => setTimeout(() => {
      renderWeight();
      viewDirty.weight = false;
      if (el('stats').classList.contains('active')) { renderGamification(); viewDirty.stats = true; }
      renderBackupStatus();
    }, 0));
  }

  function showWeightError(message) {
    const box = el('weightError');
    box.textContent = message;
    box.hidden = !message;
  }

  function closeWeightModal() {
    hideModal('weightModal');
    editingWeightId = null;
    editingWeightTimeZone = null;
    showWeightError('');
  }

  function openWeightModal(entry = null) {
    editingWeightId = entry?.id || null;
    editingWeightTimeZone = entry ? normalizeTimeZone(entry.timeZone) : currentTimeZone();
    const unit = data.weightUnit;
    el('weightModalTitle').textContent = entry ? t('weight.editTitle') : t('weight.addTitle');
    el('weightModalUnit').textContent = unit;
    el('weightWhen').value = toLocalInputValue(entry?.when || new Date(), editingWeightTimeZone);
    const shown = entry ? kgToDisplay(entry.kg, unit) : null;
    el('weightValueInput').value = shown == null ? '' : formatNumber(shown, 1, 1);
    showWeightError('');
    showModal('weightModal', 'weightValueInput');
  }

  function saveWeightEntry() {
    const tz = editingWeightTimeZone || currentTimeZone();
    const when = zonedLocalToDate(el('weightWhen').value, tz);
    const raw = parseLocalizedNumber(el('weightValueInput').value);
    const kg = sanitizeWeightKg(displayToKg(raw, data.weightUnit), null);
    if (!when) { showWeightError(t('weight.errDate')); return; }
    if (when.getTime() > Date.now() + 60000) { showWeightError(t('weight.errFuture')); return; }
    if (kg == null) { showWeightError(t('weight.errValue', {unit:data.weightUnit})); return; }
    const existingWeight = editingWeightId ? data.weights.find(w => w.id === editingWeightId) : null;
    const nowAudit = new Date().toISOString();
    const entry = {
      id: editingWeightId || makeId(), when: when.toISOString(), kg, timeZone: tz,
      createdAt: existingWeight ? normalizeAuditTimestamp(existingWeight.createdAt) : nowAudit,
      modifiedAt: existingWeight ? nowAudit : null
    };
    if (editingWeightId) data.weights = data.weights.map(w => w.id === editingWeightId ? entry : w);
    else data.weights.push(entry);
    if (!save({ invalidateDerived: false, dirtyViews:['weight','stats','settings'] })) { renderAll(); return; }
    closeWeightModal();
    scheduleWeightUiRefresh();
  }

  function sortedWeightsAsc() {
    return [...data.weights].sort((a, b) => new Date(a.when) - new Date(b.when));
  }

  function renderWeight() {
    const unit = data.weightUnit;
    el('unitKgBtn').classList.toggle('active', unit === 'kg');
    el('unitLbBtn').classList.toggle('active', unit === 'lb');
    el('unitKgBtn').setAttribute('aria-pressed', String(unit === 'kg'));
    el('unitLbBtn').setAttribute('aria-pressed', String(unit === 'lb'));
    el('weightTargetUnit').textContent = unit;
    const targetShown = data.targetWeightKg == null ? '' : formatNumber(kgToDisplay(data.targetWeightKg, unit), 1, 1);
    if (document.activeElement !== el('weightTargetInput')) el('weightTargetInput').value = targetShown;

    const asc = sortedWeightsAsc();
    const latest = asc.length ? asc[asc.length - 1] : null;
    const first = asc.length ? asc[0] : null;
    el('wLatest').textContent = latest ? formatWeight(latest.kg, unit) : '—';
    el('wChange').textContent = latest && first ? formatWeight(latest.kg - first.kg, unit, true) : '—';
    el('wTarget').textContent = data.targetWeightKg == null ? '—' : formatWeight(data.targetWeightKg, unit);
    el('wToTarget').textContent = latest && data.targetWeightKg != null ? formatWeight(latest.kg - data.targetWeightKg, unit, true) : '—';

    const box = el('weightHistoryList');
    box.replaceChildren();
    if (!asc.length) {
      const empty = document.createElement('div');
      empty.className = 'historyEmpty';
      empty.textContent = t('weight.empty');
      box.append(empty);
    } else {
      const sortedDesc = [...asc].reverse();
      const visibleWeights = sortedDesc.slice(0, weightVisibleCount);
      visibleWeights.forEach(w => {
        const row = document.createElement('div'); row.className = 'row historyRow';
        const left = document.createElement('div'); left.style.minWidth = '0';
        const strong = document.createElement('strong'); strong.textContent = localDateLabel(w.when, w.timeZone); left.append(strong);
        const when = document.createElement('div'); when.className = 'small'; when.textContent = localDateTimeLabel(w.when, w.timeZone); left.append(when);
        const right = document.createElement('div'); right.style.textAlign = 'right'; right.style.flex = '0 0 auto';
        const val = document.createElement('div'); val.className = 'duration'; val.textContent = formatWeight(w.kg, unit); right.append(val);
        const actions = document.createElement('div'); actions.className = 'historyActions';
        const edit = document.createElement('button'); edit.className = 'secondary'; edit.textContent = t('common.edit');
        bindResponsiveAction(edit, () => openWeightModal(w));
        const del = document.createElement('button'); del.className = 'dangerText'; del.textContent = t('common.delete');
        bindResponsiveAction(del, () => {
          if (!confirm(t('weight.deleteConfirm'))) return;
          data.weights = data.weights.filter(x => x.id !== w.id);
          if (!save({ invalidateDerived: false, dirtyViews:['weight','stats','settings'] })) { renderAll(); return; }
          row.remove();
          scheduleWeightUiRefresh();
        });
        actions.append(edit, del); right.append(actions); row.append(left, right); box.append(row);
      });
      if (visibleWeights.length < sortedDesc.length) {
        const wrap = document.createElement('div'); wrap.className = 'loadMoreWrap';
        const more = document.createElement('button'); more.className = 'secondary';
        more.textContent = t('common.loadMoreCount', {n: sortedDesc.length - visibleWeights.length});
        more.addEventListener('click', () => { weightVisibleCount += HISTORY_PAGE_SIZE; renderWeight(); });
        wrap.append(more); box.append(wrap);
      }
    }
    drawWeightChart();
  }

  function drawWeightChart() {
    const c = el('weightChart');
    if (!c) return;
    const ctx = c.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || 660, cssH = 240;
    c.width = Math.floor(cssW * ratio); c.height = Math.floor(cssH * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const entries = sortedWeightsAsc().slice(-30);
    const style = getComputedStyle(document.documentElement);
    const line = style.getPropertyValue('--line').trim();
    const accent = style.getPropertyValue('--accent').trim();
    const muted = style.getPropertyValue('--muted').trim();
    const good = style.getPropertyValue('--good').trim();
    const unit = data.weightUnit;

    if (!entries.length) {
      ctx.fillStyle = muted; ctx.font = '13px -apple-system'; ctx.textAlign = 'center';
      ctx.fillText(t('weight.addChart'), cssW / 2, cssH / 2);
      ctx.textAlign = 'start'; return;
    }

    const values = entries.map(e => kgToDisplay(e.kg, unit));
    const target = data.targetWeightKg == null ? null : kgToDisplay(data.targetWeightKg, unit);
    const scaleValues = target == null ? [...values] : [...values, target];
    let minV = Math.min(...scaleValues), maxV = Math.max(...scaleValues);
    let span = maxV - minV;
    const padV = span > 0 ? Math.max(span * .15, unit === 'lb' ? 2 : 1) : (unit === 'lb' ? 5 : 2);
    minV -= padV; maxV += padV; span = maxV - minV || 1;

    const top = 18, bottom = 34, left = 46, right = 12, w = cssW - left - right, h = cssH - top - bottom;
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    [0, .5, 1].forEach(frac => {
      const y = top + h - h * frac;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(cssW-right, y); ctx.stroke();
      const label = minV + span * frac;
      ctx.fillStyle = muted; ctx.font = '10px -apple-system'; ctx.textAlign = 'right';
      ctx.fillText(formatNumber(label, 1, 1), left - 6, y + 3);
    });

    const yFor = v => top + h - ((v - minV) / span) * h;
    const times = entries.map(e => new Date(e.when).getTime());
    const minT = Math.min(...times), maxT = Math.max(...times), timeSpan = maxT - minT;
    const xFor = i => timeSpan <= 0 ? left + w/2 : left + ((times[i]-minT)/timeSpan)*w;

    if (target != null) {
      const y = yFor(target);
      ctx.save(); ctx.strokeStyle = good; ctx.setLineDash([5,4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(cssW-right, y); ctx.stroke(); ctx.restore();
    }

    ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    entries.forEach((e,i) => { const x=xFor(i), y=yFor(values[i]); if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
    ctx.stroke();
    ctx.fillStyle = accent;
    entries.forEach((e,i) => { const x=xFor(i), y=yFor(values[i]); ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2); ctx.fill(); });

    let labelIndexes;
    if (entries.length <= 4) labelIndexes = entries.map((_,i)=>i);
    else {
      const midT=minT+timeSpan/2;
      let midI=0, midDistance=Infinity;
      times.forEach((time,i)=>{ const distance=Math.abs(time-midT); if(distance<midDistance){midDistance=distance;midI=i;} });
      labelIndexes=[...new Set([0,midI,entries.length-1])];
    }
    ctx.fillStyle = muted; ctx.font = '10px -apple-system'; ctx.textAlign = 'center';
    labelIndexes.forEach(i => { const d = new Date(entries[i].when); const tz=entries[i].timeZone || currentTimeZone(); const label=d.toLocaleDateString(currentLocale(), {day:'numeric',month:'numeric',timeZone:tz}); ctx.fillText(label, xFor(i), cssH - 10); });
    ctx.textAlign = 'start';
  }

  function setWeightUnit(unit) {
    data.weightUnit = normalizeWeightUnit(unit);
    save({ invalidateDerived:false, dirtyViews:['weight','stats','settings'] });
    renderWeight();
    viewDirty.weight = false;
  }

  function setTargetWeightFromInput() {
    const raw = el('weightTargetInput').value.trim();
    if (!raw) {
      data.targetWeightKg = null;
      save({ invalidateDerived:false, dirtyViews:['weight','stats','settings'] }); renderWeight(); viewDirty.weight = false; return;
    }
    const kg = sanitizeWeightKg(displayToKg(parseLocalizedNumber(raw), data.weightUnit), null);
    if (kg == null) {
      alert(t('weight.errTarget', {unit:data.weightUnit}));
      renderWeight(); return;
    }
    data.targetWeightKg = kg;
    save({ invalidateDerived:false, dirtyViews:['weight','stats','settings'] }); renderWeight(); viewDirty.weight = false;
  }

  function hasBackupWorthyData() {
    return !!data.activeStart || data.records.length > 0 || data.weights.length > 0;
  }

  function normalizeBackupClockSkew() {
    const nowMs = Date.now();
    let changed = false;
    for (const key of ['firstDataAt','lastExternalBackupAt']) {
      const d = validDate(backupMeta[key]);
      if (d && d.getTime() > nowMs + FUTURE_TOLERANCE_MS) {
        backupMeta[key] = new Date(nowMs).toISOString();
        changed = true;
      }
    }
    if (changed) saveBackupMeta();
  }

  function ensureBackupTrackingStarted() {
    normalizeBackupClockSkew();
    if (!hasBackupWorthyData()) {
      if (backupMeta.firstDataAt) {
        backupMeta.firstDataAt = null;
        saveBackupMeta();
      }
      return null;
    }
    let firstData = validDate(backupMeta.firstDataAt);
    if (!firstData) {
      firstData = new Date();
      backupMeta.firstDataAt = firstData.toISOString();
      saveBackupMeta();
    }
    return firstData;
  }

  function backupIsDue() {
    if (!hasBackupWorthyData()) return false;
    const firstData = ensureBackupTrackingStarted();
    const last = validDate(backupMeta.lastExternalBackupAt);
    const base = last && firstData ? new Date(Math.max(last.getTime(), firstData.getTime())) : (last || firstData);
    return !!base && Date.now() - base.getTime() >= BACKUP_REMINDER_MS;
  }

  function renderBackupStatus() {
    normalizeBackupClockSkew();
    const label = el('lastBackupLabel');
    const banner = el('backupReminder');
    const titleBox = el('backupReminderTitle');
    const textBox = el('backupReminderText');
    const nextLabel = el('nextBackupLabel');
    if (!label || !banner || !textBox) return;
    const last = validDate(backupMeta.lastExternalBackupAt);
    label.textContent = last ? localDateLabel(last) : t('backup.noneYet');
    const due = backupIsDue();
    const snapshotAttention = hasBackupWorthyData() && (snapshotProtectionState.status === 'failed' || snapshotProtectionState.status === 'reduced');
    banner.hidden = !(due || snapshotAttention);
    banner.classList.toggle('warn', snapshotAttention);
    if (titleBox) titleBox.textContent = snapshotAttention ? t('backup.snapshotAttentionTitle') : t('backup.reminderTitle');
    if (snapshotAttention) {
      textBox.textContent = snapshotProtectionState.status === 'failed'
        ? t('backup.autoSnapshotFailed')
        : t('backup.autoSnapshotReduced', {n:snapshotProtectionState.kept});
    } else if (due) textBox.textContent = last ? t('backup.dueLast', {date:localDateLabel(last)}) : t('backup.dueNever');
    if (nextLabel) {
      if (!hasBackupWorthyData()) nextLabel.textContent = t('backup.nextStarts');
      else {
        const firstData = ensureBackupTrackingStarted();
        const base = last || firstData;
        const next = base ? new Date(base.getTime() + BACKUP_REMINDER_MS) : null;
        nextLabel.textContent = !next ? t('backup.nextStarts') : (Date.now() >= next.getTime() ? t('backup.nextDueNow') : t('backup.nextOn', {date:localDateLabel(next)}));
      }
    }
  }

  function renderSnapshotStatus() {
    const status = el('snapshotStatus');
    const btn = el('restoreSnapshotBtn');
    if (!status || !btn) return;
    const snapshots = loadSnapshots();
    if (snapshotProtectionState.status === 'failed' && hasBackupWorthyData()) status.textContent = t('backup.snapshotFailedStatus');
    else if (snapshotProtectionState.status === 'reduced' && hasBackupWorthyData()) status.textContent = t('backup.snapshotReducedStatus', {n:snapshots.length});
    else status.textContent = snapshots.length ? t('backup.rollingPolicy', {n:snapshots.length}) : t('backup.snapshotNone');
    btn.disabled = snapshots.length === 0;
  }

  function markExternalBackupNow() {
    backupMeta.lastExternalBackupAt = new Date().toISOString();
    saveBackupMeta();
    renderBackupStatus();
    renderGamification();
  }

  function makeBackupPayload() {
    return {
      format: BACKUP_FORMAT,
      backupVersion: BACKUP_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(data))
    };
  }

  async function exportBackup() {
    const backup = makeBackupPayload();
    const now = new Date();
    const stamp = `${dayKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${String(now.getMilliseconds()).padStart(3, '0')}`;
    const name = `fasting-backup-${stamp}.json`;
    const json = JSON.stringify(backup, null, 2);
    try {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        markExternalBackupNow();
        return true;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return false;
    }
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      const confirmed = confirm(t('backup.downloadConfirm'));
      if (confirmed) markExternalBackupNow();
      return confirmed;
    } catch {
      alert(t('backup.errCreate'));
      return false;
    }
  }


  function selectedIconInstallUrl() {
    const u = new URL(location.href);
    u.search = ''; u.hash = '';
    u.searchParams.set('icon', normalizeIconChoice(data.iconChoice));
    const pref = normalizeLanguage(data.language);
    if (pref !== 'system') u.searchParams.set('lang', pref);
    return u.toString();
  }

  function refreshReinstallLink() {
    const box = el('reinstallLinkInput');
    if (box) box.value = selectedIconInstallUrl();
  }

  function showReinstallLink() {
    refreshReinstallLink();
    const tools = el('reinstallLinkTools');
    if (tools) tools.hidden = false;
    const status = el('reinstallLinkStatus');
    if (status) status.textContent = t('iconChange.ready', {icon:t(`icon.${normalizeIconChoice(data.iconChoice)}`)});
  }

  async function copyReinstallLink() {
    const input = el('reinstallLinkInput');
    const status = el('reinstallLinkStatus');
    if (!input) return;
    refreshReinstallLink();
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(input.value);
        copied = true;
      }
    } catch {}
    if (!copied) {
      try {
        input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
        copied = !!document.execCommand?.('copy');
      } catch {}
    }
    if (status) status.textContent = copied ? t('iconChange.copied') : t('iconChange.copyFailed');
    if (!copied) {
      try { input.focus(); input.select(); input.setSelectionRange(0, input.value.length); } catch {}
    }
  }

  async function prepareIconChange() {
    const ok = await exportBackup();
    if (!ok) return;
    showReinstallLink();
  }

  function visibleModal() {
    return [...document.querySelectorAll('.modalBackdrop')].find(modal => !modal.hidden) || null;
  }

  function setBackgroundInert(inert) {
    for (const node of [document.querySelector('main'), document.querySelector('nav')]) {
      if (!node) continue;
      node.inert = !!inert;
      if (inert) node.setAttribute('aria-hidden', 'true');
      else node.removeAttribute('aria-hidden');
    }
  }

  function showModal(id, focusId = null) {
    const modal = el(id);
    if (!modal) return;
    lastModalFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.hidden = false;
    document.body.classList.add('modalOpen');
    setBackgroundInert(true);
    setTimeout(() => {
      const target = focusId ? el(focusId) : modal.querySelector('button, input, select, a[href], [tabindex]:not([tabindex="-1"])');
      target?.focus();
    }, 0);
  }

  function hideModal(id) {
    const modal = el(id);
    if (modal) modal.hidden = true;
    if (!visibleModal()) {
      document.body.classList.remove('modalOpen');
      setBackgroundInert(false);
      if (recoveryMode) applyRecoveryMode();
    }
    const restore = lastModalFocus;
    lastModalFocus = null;
    if (restore && document.contains(restore)) setTimeout(() => restore.focus(), 0);
  }

  function closeSnapshotModal() {
    hideModal('snapshotModal');
  }

  async function restoreSnapshot(snapshotId) {
    const selected = loadSnapshots().find(s => s.id === snapshotId);
    if (!selected) { alert(t('backup.snapshotUnavailable')); return; }
    const when = validDate(selected.createdAt);
    const label = when ? localDateTimeLabel(when) : 'the selected time';
    if (!confirm(t('backup.snapshotRestoreConfirm', {date:label}))) return;
    try {
      const payload = await loadSnapshotPayload(snapshotId);
      if (!payload) { alert(t('backup.snapshotUnavailable')); return; }
      const restored = validateCompatibleData(payload).data;
      if (!recoveryMode) {
        const safety = await createInternalSnapshotAsync('before restoring another snapshot');
        if (!safety) { alert(t('backup.snapshotFailed')); return; }
      }
      if (!persistResolvedData(restored)) return;
      await flushPrimaryPersistence();
      closeSnapshotModal();
      renderAll();
      alert(t('backup.snapshotRestored'));
    } catch { alert(t('backup.snapshotUnavailable')); }
  }

  function snapshotReasonLabel(reason) {
    const text = String(reason || '');
    let m = text.match(/^before first launch of v(.+)$/);
    if (m) return t('backup.reason.firstLaunch', {version:m[1]});
    if (text === 'before restoring another snapshot') return t('backup.reason.restore');
    m = text.match(/^before updating from v(.+) to v(.+)$/);
    if (m) return t('backup.reason.update', {from:m[1], to:m[2]});
    if (text === 'before importing an external backup') return t('backup.reason.import');
    if (text === 'automatic change') return t('backup.autoReason');
    return text || '—';
  }

  function openSnapshotModal() {
    const box = el('snapshotList');
    const snapshots = loadSnapshots();
    box.innerHTML = '';
    if (!snapshots.length) {
      box.innerHTML = `<div class="historyEmpty">${t('backup.snapshotEmpty')}</div>`;
    } else {
      snapshots.forEach(snapshot => {
        const row = document.createElement('div');
        row.className = 'snapshotItem';
        const info = document.createElement('div');
        const when = validDate(snapshot.createdAt);
        const title = document.createElement('strong');
        title.textContent = when ? localDateTimeLabel(when) : t('backup.snapshotTitle');
        const detail = document.createElement('div');
        detail.className = 'small';
        const tierKeys = snapshotTierKeys(snapshot, snapshots);
        const tierText = tierKeys.map(key => t(key)).join(' / ');
        detail.textContent = t('backup.snapshotFrom', {version:snapshot.sourceAppVersion || '—', reason:snapshotReasonLabel(snapshot.reason)}) + (tierText ? ` • ${t('backup.tiers', {tiers:tierText})}` : '');
        info.append(title, detail);
        const btn = document.createElement('button');
        btn.className = 'secondary';
        btn.textContent = t('common.restore');
        btn.addEventListener('click', () => restoreSnapshot(snapshot.id));
        row.append(info, btn);
        box.appendChild(row);
      });
    }
    showModal('snapshotModal', 'snapshotCloseBtn');
  }

  function openUpdateModal() {
    if (!updateAvailable) { checkForUpdates(); return; }
    el('updateModalText').textContent = t('update.modalText', {version:latestVersion});
    showModal('updateModal', 'updateCancelBtn');
  }

  function closeUpdateModal() { hideModal('updateModal'); }

  function compareVersions(a, b) {
    const pa = String(a).split('.').map(x => Number.parseInt(x, 10) || 0);
    const pb = String(b).split('.').map(x => Number.parseInt(x, 10) || 0);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      const av = pa[i] || 0, bv = pb[i] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }

  function setUpdateUI(state, message = '') {
    const status = el('updateStatus');
    const btn = el('updateBtn');
    const banner = el('updateBanner');
    const bannerText = el('updateBannerText');
    status.classList.remove('good', 'warn');

    if (state === 'checking') {
      status.textContent = t('update.checking'); btn.textContent = t('update.checkingBtn'); btn.disabled = true; banner.hidden = true;
    } else if (state === 'available') {
      updateAvailable = true; status.textContent = t('update.available', {version:latestVersion}); status.classList.add('warn');
      btn.textContent = t('update.updateNow'); btn.disabled = false; bannerText.textContent = t('update.ready', {version:latestVersion}); banner.hidden = false;
    } else if (state === 'updating') {
      status.textContent = t('update.installing'); status.classList.add('warn'); btn.textContent = t('update.updating'); btn.disabled = true;
      bannerText.textContent = t('update.installingShort'); banner.hidden = false;
    } else if (state === 'offline') {
      updateAvailable = false; status.textContent = message || t('update.offline'); btn.textContent = t('update.check'); btn.disabled = false; banner.hidden = true;
    } else {
      updateAvailable = false; status.textContent = t('update.current', {version:APP_VERSION}); status.classList.add('good'); btn.textContent = t('update.check'); btn.disabled = false; banner.hidden = true;
    }
  }

  async function checkForUpdates({ quiet = false } = {}) {
    if (!quiet) setUpdateUI('checking');
    if (navigator.onLine === false) {
      setUpdateUI('offline', t('update.offlineExplicit'));
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('version check failed');
      const info = await response.json();
      if (Number(info.protocolVersion) !== UPDATE_PROTOCOL_VERSION || !Array.isArray(info.shell) || typeof info.entry !== 'string') throw new Error('unsupported update metadata');
      const remote = typeof info.version === 'string' ? info.version.trim() : '';
      if (!/^\d+\.\d+\.\d+$/.test(remote)) throw new Error('invalid version');
      latestVersion = remote;
      if (compareVersions(remote, APP_VERSION) > 0) setUpdateUI('available');
      else setUpdateUI('current');
    } catch {
      const msg = navigator.onLine === false
        ? t('update.offlineExplicit')
        : t('update.failed');
      setUpdateUI('offline', msg);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function requestShellRefresh(version) {
    if (!('serviceWorker' in navigator)) throw new Error('service worker unavailable');
    const reg = await navigator.serviceWorker.ready;
    const controller = navigator.serviceWorker.controller || reg.active;
    if (!controller) throw new Error('service worker not controlling this page');
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error('update timed out')), 35000);
      channel.port1.onmessage = event => {
        clearTimeout(timer);
        if (event.data?.ok) resolve(event.data);
        else reject(new Error(event.data?.error || 'update failed'));
      };
      controller.postMessage({ type:'REFRESH_RELEASE', version, protocolVersion: UPDATE_PROTOCOL_VERSION }, [channel.port2]);
    });
  }

  async function installUpdate() {
    if (updateInProgress) return;
    if (!await createInternalSnapshotAsync(`before updating from v${APP_VERSION} to v${latestVersion}`)) {
      alert(t('backup.snapshotFailed')); return;
    }
    updateInProgress = true; setUpdateUI('updating');
    try {
      if (navigator.onLine === false) throw new Error('offline');
      await requestShellRefresh(latestVersion);
      window.location.reload();
    } catch {
      updateInProgress = false; setUpdateUI('offline', t('update.failedInstall'));
    }
  }

  function persistUrlLanguageOverride() {
    if (!urlLangOverride) return true;
    const chosen = urlLangOverride;
    if (data.language !== chosen) {
      data.language = chosen;
      if (!save({ invalidateDerived:false, dirtyViews:['fasting','history','weight','stats','settings'] })) return false;
    }
    try { localStorage.setItem('fastingTrackerPublicLang', chosen); } catch {}
    try { const u=new URL(location.href); u.searchParams.delete('lang'); history.replaceState(null,'',u); } catch {}
    urlLangOverride = null;
    return true;
  }

  function persistUrlIconOverride() {
    if (!urlIconOverride) return true;
    const chosen = normalizeIconChoice(urlIconOverride);
    if (data.iconChoice !== chosen) {
      data.iconChoice = chosen;
      if (!save({ invalidateDerived:false, dirtyViews:['settings'] })) return false;
    }
    try { const u=new URL(location.href); u.searchParams.delete('icon'); history.replaceState(null,'',u); } catch {}
    urlIconOverride = null;
    return true;
  }

  function applyRecoveryMode() {
    const active = !!recoveryMode;
    const banner = el('recoveryBanner');
    if (banner) banner.hidden = !active;
    const diagnostic = el('recoveryDiagnostic');
    if (diagnostic) diagnostic.textContent = active ? `${t('recovery.reason')}: ${recoveryMode.error} • v${APP_VERSION}` : '';
    document.body.classList.toggle('recoveryMode', active);
    document.querySelectorAll('.screen, nav').forEach(node => { node.inert = active; });
    toggleFast.disabled = active || fastActionLocked;
    startEarlierBtn.disabled = active;
  }

  async function exportRecoveryRaw() {
    if (!recoveryMode) return;
    try {
      const now = new Date();
      const name = `fasting-recovery-raw-${dayKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
      const raw = String(recoveryMode.raw || '');
      const file = new File([raw], name, {type:'application/json'});
      if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {
        try { await navigator.share({files:[file]}); return; }
        catch (err) { if (err && err.name === 'AbortError') return; }
      }
      const blob = new Blob([raw], {type:'application/json'});
      const a = document.createElement('a');
      a.download = name;
      a.href = URL.createObjectURL(blob); a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch { alert(t('backup.errCreate')); }
  }

  function resetFromRecovery() {
    if (!recoveryMode || !confirm(t('recovery.resetConfirm'))) return;
    if (persistResolvedData(cloneDefault())) {
      recoveryMode = null;
      renderAll();
    }
  }

  function activeScreenId() {
    return document.querySelector('.screen.active')?.id || 'fasting';
  }

  function applyPreferencesIfChanged(force = false) {
    const lang = uiLanguage();
    const appearance = normalizeAppearance(data.appearance);
    const icon = normalizeIconChoice(data.iconChoice);
    if (force || lang !== lastAppliedLanguage) { invalidateDerivedCaches(); applyLanguage(); lastAppliedLanguage = lang; markViewsDirty(); }
    if (force || appearance !== lastAppliedAppearance) { applyAppearance(); lastAppliedAppearance = appearance; }
    if (force || icon !== lastAppliedIcon) { applyIconChoice(); lastAppliedIcon = icon; }
  }

  function queueStorageProtectionRefresh() {
    if (storageProtectionRefreshQueued) return;
    storageProtectionRefreshQueued = true;
    const run = () => { storageProtectionRefreshQueued = false; refreshStorageProtection(); };
    if ('requestIdleCallback' in window) requestIdleCallback(run, {timeout:800}); else setTimeout(run, 80);
  }

  function renderScreen(screen = activeScreenId(), { force = false } = {}) {
    if (!force && !viewDirty[screen]) return;
    if (screen === 'fasting') updateTimer();
    else if (screen === 'history') renderHistory();
    else if (screen === 'weight') renderWeight();
    else if (screen === 'stats') renderStats();
    else if (screen === 'settings') {
      renderBackupStatus();
      renderSnapshotStatus();
      renderInstallStorageNotice();
      queueStorageProtectionRefresh();
      renderGamification();
    }
    viewDirty[screen] = false;
  }

  function renderAll() {
    // Compatibility entry point: mark hidden views dirty, but render only the
    // screen the user can actually see. This avoids rebuilding charts/history
    // after unrelated changes while guaranteeing fresh content on next visit.
    applyPreferencesIfChanged();
    applyRecoveryMode();
    markViewsDirty();
    renderBackupStatus();
    renderInstallStorageNotice();
    renderScreen(activeScreenId(), { force:true });
  }

  function applyGoalValue(value) {
    data.goalHours = sanitizeGoal(value, data.goalHours);
    const ok = save({ invalidateDerived:false, dirtyViews:['fasting','settings'] });
    if (ok) { updateTimer(); viewDirty.fasting = false; renderBackupStatus(); }
    else renderAll();
    return ok;
  }

  function longFastNoticeSeen() {
    try { return localStorage.getItem(LONG_FAST_NOTICE_KEY) === '1'; } catch { return false; }
  }

  function requestGoalChange(value) {
    const parsed = parseLocalizedNumber(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_SAFE_GOAL_HOURS) {
      alert(t('error.goal'));
      goalHours.value = formatNumber(data.goalHours, 0, 3);
      return;
    }
    const next = sanitizeGoal(parsed, data.goalHours);
    if (next >= LONG_FAST_NOTICE_HOURS && !longFastNoticeSeen()) {
      pendingLongFastGoal = next;
      pendingLongFastScope = 'default';
      el('longFastModalText').textContent = t('safety.longFastText', { goal: formatGoal(next) });
      showModal('longFastModal', 'longFastCancelBtn');
      return;
    }
    applyGoalValue(next);
  }

  el('languageSelect').addEventListener('change', () => {
    urlLangOverride = null;
    try { const u=new URL(location.href); u.searchParams.delete('lang'); history.replaceState(null,'',u); } catch {}
    data.language = normalizeLanguage(el('languageSelect').value);
    if (!save({ invalidateDerived:false, dirtyViews:['fasting','history','weight','stats','settings'] })) { renderAll(); return; }
    lastAppliedLanguage = null;
    renderAll();
    if (!el('reinstallLinkTools').hidden) refreshReinstallLink();
    checkForUpdates({ quiet: false });
  });

  el('appearanceSelect').addEventListener('change', () => {
    data.appearance = normalizeAppearance(el('appearanceSelect').value);
    if (!save({ invalidateDerived:false, dirtyViews:['settings'] })) { renderAll(); return; }
    applyAppearance();
    if (el('stats').classList.contains('active')) renderStatsVisualizations();
    if (el('weight').classList.contains('active')) drawWeightChart();
  });
  document.querySelectorAll('.iconChoice[data-icon-choice]').forEach(btn => btn.addEventListener('click', () => {
    urlIconOverride = null;
    try { const u=new URL(location.href); u.searchParams.delete('icon'); history.replaceState(null,'',u); } catch {}
    data.iconChoice = normalizeIconChoice(btn.dataset.iconChoice);
    if (!save({ invalidateDerived:false, dirtyViews:['settings'] })) { renderAll(); return; }
    applyIconChoice();
    if (!el('reinstallLinkTools').hidden) refreshReinstallLink();
  }));
  el('prepareIconChangeBtn').addEventListener('click', prepareIconChange);
  el('copyReinstallLinkBtn').addEventListener('click', copyReinstallLink);
  if (systemThemeQuery.addEventListener) systemThemeQuery.addEventListener('change', () => { if (normalizeAppearance(data.appearance)==='system') { applyAppearance(); markViewsDirty('stats','weight'); if (el('stats').classList.contains('active')) renderScreen('stats'); if (el('weight').classList.contains('active')) renderScreen('weight'); } });

  goalHours.addEventListener('change', () => requestGoalChange(goalHours.value));
  goalHours.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      goalHours.blur();
      requestGoalChange(goalHours.value);
    }
  });

  document.querySelectorAll('.chip[data-goal]').forEach(chip => chip.addEventListener('click', () => {
    requestGoalChange(chip.dataset.goal);
  }));

  el('gamificationToggle').addEventListener('change', () => {
    data.gamificationEnabled = el('gamificationToggle').checked;
    if (!save({ invalidateDerived:false, dirtyViews:['stats','settings'] })) { renderAll(); return; }
    if (el('stats').classList.contains('active')) renderGamification();
  });

  const APP_DOC_PATHS = Object.freeze(['about.html','privacy.html','branding.html','license.html']);
  function rememberDocumentReturn(event) {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    let target;
    try { target = new URL(anchor.href, location.href); } catch { return; }
    if (target.origin !== location.origin) return;
    const name = target.pathname.split('/').pop();
    if (!APP_DOC_PATHS.includes(name)) return;
    try { sessionStorage.setItem(DOC_RETURN_KEY, location.href); } catch {}
  }
  // Capture before navigation starts. sessionStorage belongs to this exact PWA/tab
  // browsing context, so a chain such as Settings -> About -> License can return
  // to the screen that originally opened the documentation.
  document.addEventListener('click', rememberDocumentReturn, true);

  const APP_SCREENS = Object.freeze(['fasting','history','weight','stats','settings']);
  function activateScreen(screen, { updateHash = true } = {}) {
    const target = APP_SCREENS.includes(screen) ? screen : 'fasting';
    document.querySelectorAll('.tab').forEach(tab => {
      const active = tab.dataset.screen === target;
      tab.classList.toggle('active', active);
      if (active) tab.setAttribute('aria-current','page'); else tab.removeAttribute('aria-current');
    });
    document.querySelectorAll('.screen').forEach(node => node.classList.toggle('active', node.id === target));
    if (updateHash) {
      const next = new URL(location.href);
      next.hash = target === 'fasting' ? '' : target;
      history.replaceState(history.state, '', next);
    }
    if (target === 'stats' && statsVizMode === 'timeline') timelineScrollToLatestPending = true;
    // Render the newly visible screen only when its data is dirty. Previously
    // hidden canvases are never redrawn simply because some other screen changed.
    requestAnimationFrame(() => {
      renderScreen(target);
      if (target === 'stats' && statsVizMode === 'timeline') scrollTimelineToLatest();
    });
  }

  document.querySelectorAll('.tab').forEach(tab => bindResponsiveAction(tab, () => activateScreen(tab.dataset.screen)));
  window.addEventListener('hashchange', () => activateScreen(location.hash.slice(1), { updateHash: false }));

  startEarlierBtn.addEventListener('click', openBackdateModal);
  bindResponsiveAction(editActiveTargetBtn, openActiveTargetModal);
  el('activeTargetCancelBtn').addEventListener('click', closeActiveTargetModal);
  bindResponsiveAction(el('activeTargetSaveBtn'), () => requestActiveGoalChange(el('activeTargetInput').value));
  el('activeTargetInput').addEventListener('input', () => { showActiveTargetError(''); syncActiveTargetPresetState(); });
  el('activeTargetInput').addEventListener('keydown', e => { if (e.key === 'Enter') requestActiveGoalChange(el('activeTargetInput').value); });
  document.querySelectorAll('[data-active-goal]').forEach(btn => bindResponsiveAction(btn, () => {
    el('activeTargetInput').value = formatNumber(Number(btn.dataset.activeGoal), 0, 3);
    showActiveTargetError('');
    syncActiveTargetPresetState();
  }));
  el('activeTargetModal').addEventListener('click', e => { if (e.target === el('activeTargetModal')) closeActiveTargetModal(); });
  el('backdateCancelBtn').addEventListener('click', closeBackdateModal);
  el('backdateStartBtn').addEventListener('click', saveBackdatedActiveFast);
  el('backdateStart').addEventListener('input', () => { showBackdateError(''); clearBackdateConflict(); });
  el('backdateAdjustBtn').addEventListener('click', adjustBackdateAfterConflicts);
  el('backdateEditConflictBtn').addEventListener('click', editBackdateConflict);
  el('backdateDeleteConflictBtn').addEventListener('click', deleteBackdateConflictAndStart);
  el('backdateModal').addEventListener('click', e => { if (e.target === el('backdateModal')) closeBackdateModal(); });
  document.querySelectorAll('.backdatePreset').forEach(btn => btn.addEventListener('click', () => setBackdatePreset(btn.dataset.hours)));

  el('addEntryBtn').addEventListener('click', () => openEntryModal());
  el('entryCancelBtn').addEventListener('click', closeEntryModal);
  el('entrySaveBtn').addEventListener('click', saveManualEntry);
  el('entryModal').addEventListener('click', e => { if (e.target === el('entryModal')) closeEntryModal(); });
  bindResponsiveAction(el('addWeightBtn'), () => openWeightModal());
  el('weightCancelBtn').addEventListener('click', closeWeightModal);
  bindResponsiveAction(el('weightSaveBtn'), saveWeightEntry);
  el('weightModal').addEventListener('click', e => { if (e.target === el('weightModal')) closeWeightModal(); });
  el('unitKgBtn').addEventListener('click', () => setWeightUnit('kg'));
  el('unitLbBtn').addEventListener('click', () => setWeightUnit('lb'));
  el('weightTargetInput').addEventListener('change', setTargetWeightFromInput);
  el('weightTargetInput').addEventListener('keydown', e => { if (e.key === 'Enter') { el('weightTargetInput').blur(); setTargetWeightFromInput(); } });
  document.addEventListener('keydown', e => {
    const modal = visibleModal();
    if (e.key === 'Escape' && modal) {
      if (modal.id === 'backdateModal') closeBackdateModal();
      else if (modal.id === 'activeTargetModal') closeActiveTargetModal();
      else if (modal.id === 'entryModal') closeEntryModal();
      else if (modal.id === 'weightModal') closeWeightModal();
      else if (modal.id === 'updateModal') closeUpdateModal();
      else if (modal.id === 'snapshotModal') closeSnapshotModal();
      else if (modal.id === 'longFastModal') { pendingLongFastGoal = null; pendingLongFastScope = 'default'; hideModal('longFastModal'); renderAll(); }
      return;
    }
    if (e.key === 'Tab' && modal) {
      const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter(node => !node.hidden && node.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  el('longFastCancelBtn').addEventListener('click', () => { pendingLongFastGoal = null; pendingLongFastScope = 'default'; hideModal('longFastModal'); renderAll(); });
  el('longFastContinueBtn').addEventListener('click', () => {
    const next = pendingLongFastGoal;
    const scope = pendingLongFastScope;
    pendingLongFastGoal = null;
    pendingLongFastScope = 'default';
    hideModal('longFastModal');
    const applied = next != null && (scope === 'active' ? applyActiveGoalValue(next) : applyGoalValue(next));
    if (applied) { try { localStorage.setItem(LONG_FAST_NOTICE_KEY, '1'); } catch {} }
  });
  el('longFastModal').addEventListener('click', e => { if (e.target === el('longFastModal')) { pendingLongFastGoal = null; pendingLongFastScope = 'default'; hideModal('longFastModal'); renderAll(); } });

  el('recoveryExportBtn').addEventListener('click', exportRecoveryRaw);
  el('recoverySnapshotsBtn').addEventListener('click', openSnapshotModal);
  el('recoveryImportBtn').addEventListener('click', () => el('importFile').click());
  el('recoveryResetBtn').addEventListener('click', resetFromRecovery);

  el('exportBtn').addEventListener('click', exportBackup);
  el('backupReminderBtn').addEventListener('click', exportBackup);
  el('settingsBackupNowBtn').addEventListener('click', exportBackup);

  el('importBtn').addEventListener('click', () => el('importFile').click());
  el('importFile').addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (f.size > MAX_IMPORT_BYTES) throw new Error('backup file too large');
      const raw = JSON.parse(await f.text());
      if (!raw || typeof raw !== 'object' || raw.format !== BACKUP_FORMAT || raw.backupVersion !== BACKUP_VERSION || !raw.data) {
        throw new Error('invalid backup format');
      }
      if (typeof raw.appVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(raw.appVersion) || !validDate(raw.exportedAt)) {
        throw new Error('invalid backup metadata');
      }
      const imported = validateCompatibleData(raw.data).data;
      if (!confirm(t('import.confirm', {fasts: imported.records.length, fastWord: t(pluralKey('import.fast', imported.records.length)), weights: imported.weights.length, weightWord: t(pluralKey('import.weight', imported.weights.length))}))) {
        e.target.value = '';
        return;
      }
      if (!recoveryMode) {
        if (!await createInternalSnapshotAsync('before importing an external backup')) { alert(t('backup.snapshotFailed')); e.target.value = ''; return; }
      }
      if (!persistResolvedData(imported)) { e.target.value = ''; return; }
      await flushPrimaryPersistence();
      renderAll();
      alert(t('import.done'));
    } catch {
      alert(t('import.invalid'));
    }
    e.target.value = '';
  });

  el('resetBtn').addEventListener('click', async () => {
    if (confirm(t('reset.confirm'))) {
      data = cloneDefault();
      storedDayTotalsMap = new Map();
      persistedRecordMap = new Map();
      data.revision = 1; data.updatedAt = new Date().toISOString();
      await persistPrimaryNow(data);
      snapshotCache = [];
      await Promise.all([idbClear('snapshotMeta'), idbClear('snapshotPayload')]);
      try { localStorage.removeItem(SNAPSHOT_KEY); localStorage.removeItem(LONG_FAST_NOTICE_KEY); localStorage.removeItem('fastingTrackerPublicLang'); } catch {}
      backupMeta = { firstSeenAt: new Date().toISOString(), firstDataAt: null, lastExternalBackupAt: null, snapshotProtectionStatus: 'ok', snapshotProtectionAt: null, snapshotStoredCount: 0, snapshotDesiredCount: 0 };
      snapshotProtectionState = { status: 'ok', kept: 0, desired: 0 };
      automaticSnapshotFailureAlerted = false;
      saveBackupMeta();
      invalidateDerivedCaches(); markViewsDirty(); renderAll();
    }
  });

  el('restoreSnapshotBtn').addEventListener('click', openSnapshotModal);
  el('snapshotCloseBtn').addEventListener('click', closeSnapshotModal);
  el('snapshotModal').addEventListener('click', e => { if (e.target === el('snapshotModal')) closeSnapshotModal(); });

  el('updateBtn').addEventListener('click', () => updateAvailable ? openUpdateModal() : checkForUpdates());
  el('updateBannerBtn').addEventListener('click', openUpdateModal);
  el('updateCancelBtn').addEventListener('click', closeUpdateModal);
  el('updateModal').addEventListener('click', e => { if (e.target === el('updateModal')) closeUpdateModal(); });
  el('updateWithoutBackupBtn').addEventListener('click', () => { closeUpdateModal(); installUpdate(); });
  el('backupUpdateBtn').addEventListener('click', async () => {
    const btn = el('backupUpdateBtn');
    btn.disabled = true;
    btn.textContent = t('update.preparing');
    const ok = await exportBackup();
    btn.disabled = false;
    btn.textContent = t('update.backupUpdate');
    if (!ok) return;
    closeUpdateModal();
    installUpdate();
  });

  el('chart').addEventListener('pointerdown', beginTimelinePointer);
  el('chart').addEventListener('pointermove', moveTimelinePointer);
  el('chart').addEventListener('pointerup', finishTimelinePointer);
  el('chart').addEventListener('pointercancel', cancelTimelinePointer);
  el('statsVizSwitcher').addEventListener('pointerdown', handleStatsVizPointerDown);
  el('statsVizSwitcher').addEventListener('click', handleStatsVizClick);
  el('calendarPrevBtn').addEventListener('click', () => { statsCalendarMonthOffset -= 1; statsDetailOverride = null; renderFastCalendar(); });
  el('calendarNextBtn').addEventListener('click', () => { if (statsCalendarMonthOffset < 0) statsCalendarMonthOffset += 1; statsDetailOverride = null; renderFastCalendar(); });
  el('fastTrendChart').addEventListener('pointerdown', handleTrendPointer);
  el('fastWeeksChart').addEventListener('pointerdown', handleWeeksPointer);
  window.addEventListener('resize', () => { markViewsDirty('stats','weight'); if (el('stats').classList.contains('active')) renderScreen('stats'); if (el('weight').classList.contains('active')) renderScreen('weight'); });
  window.addEventListener('online', () => { if (!emergencyBoot) checkForUpdates({ quiet: true }); });
  window.addEventListener('offline', () => setUpdateUI('offline', t('update.offlineExplicit')));
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage) return;
    if (event.key === DATA_REVISION_SIGNAL_KEY) {
      reloadFromIndexedDB({ notify: false });
      return;
    }
    if (event.key === BACKUP_META_KEY) {
      reloadBackupMetaFromStorage();
      renderBackupStatus(); renderSnapshotStatus(); renderGamification();
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { flushPrimaryPersistence(); return; } reloadBackupMetaFromStorage(); markViewsDirty(); renderBackupStatus(); renderScreen(activeScreenId()); if (!emergencyBoot) checkForUpdates({ quiet: true }); });
  window.addEventListener('pagehide', () => { flushPrimaryPersistence(); });

  el('installStorageDismiss').addEventListener('click', () => { try { localStorage.setItem(INSTALL_NOTICE_KEY, '1'); } catch {} renderInstallStorageNotice(); });
  el('storageProtectBtn').addEventListener('click', () => refreshStorageProtection({ request: true }));

  el('appVersionLabel').textContent = `v${APP_VERSION}`;
  el('appFooterVersion').textContent = `Fasting Tracker v${APP_VERSION}`;
  persistUrlLanguageOverride();
  persistUrlIconOverride();
  applyPreferencesIfChanged(true);
  applyRecoveryMode();
  renderBackupStatus();
  renderInstallStorageNotice();
  activateScreen(location.hash.slice(1), { updateHash: false });
  renderScreen(activeScreenId(), { force:true });
  if (activeScreenId() === 'settings') queueStorageProtectionRefresh();
  if (!versionTransitionSnapshotOK && !recoveryMode) setTimeout(() => alert(t('backup.snapshotFailed')), 0);
  setInterval(() => { if (data.activeStart && !document.hidden && activeScreenId() === 'fasting') updateTimer(); }, 1000);
  setInterval(() => {
    if (document.hidden) return;
    const screen = activeScreenId();
    if (!data.activeStart && screen === 'fasting') updateTimer();
    else if (data.activeStart && screen === 'stats') { invalidateDerivedCaches(); markViewsDirty('stats'); renderScreen('stats'); }
  }, 60 * 1000);
  if (hasBackupWorthyData() && loadSnapshots().length === 0) maybeCreateRollingSnapshot('automatic change');
    setInterval(renderBackupStatus, 60 * 60 * 1000);

  queueStorageProtectionRefresh();

  function isIOSDevice() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isStandaloneApp() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }

  function renderInstallStorageNotice() {
    const box = el('installStorageNotice');
    if (!box) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(INSTALL_NOTICE_KEY) === '1'; } catch {}
    box.hidden = !(isIOSDevice() && !isStandaloneApp() && !dismissed);
  }

  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '—';
    if (n < 1024) return `${Math.round(n)} B`;
    if (n < 1024 ** 2) return `${formatNumber(n / 1024, 1, 1)} KB`;
    if (n < 1024 ** 3) return `${formatNumber(n / (1024 ** 2), 1, 1)} MB`;
    return `${formatNumber(n / (1024 ** 3), 1, 1)} GB`;
  }

  async function refreshStorageProtection({ request = false } = {}) {
    const status = el('storageProtectionStatus'), usage = el('storageUsageLabel'), btn = el('storageProtectBtn');
    if (!status || !usage || !btn) return;
    if (!navigator.storage || typeof navigator.storage.persisted !== 'function') {
      status.textContent = t('storage.unavailable'); usage.textContent = t('storage.usageUnknown'); btn.hidden = true; return;
    }
    try {
      let persistent = await navigator.storage.persisted();
      if (request && !persistent && typeof navigator.storage.persist === 'function') persistent = await navigator.storage.persist();
      status.textContent = persistent ? t('storage.protected') : t('storage.bestEffort');
      btn.hidden = persistent || typeof navigator.storage.persist !== 'function';
      if (request && !persistent) status.textContent = t('storage.requestDenied');
      if (typeof navigator.storage.estimate === 'function') {
        const est = await navigator.storage.estimate();
        usage.textContent = Number.isFinite(est.usage) && Number.isFinite(est.quota) ? t('storage.usage', {used:formatBytes(est.usage), quota:formatBytes(est.quota)}) : t('storage.usageUnknown');
      } else usage.textContent = t('storage.usageUnknown');
    } catch { status.textContent = t('storage.unavailable'); usage.textContent = t('storage.usageUnknown'); btn.hidden = true; }
  }

  async function repairEmergencyBoot() {
    if (!emergencyBoot) return;
    if (recoveryMode || !versionTransitionSnapshotOK) {
      applyRecoveryMode();
      return;
    }
    setUpdateUI('updating', t('update.emergencyRecovery'));
    try {
      await requestShellRefresh(APP_VERSION);
      const u = new URL(location.href); u.searchParams.delete('ft_recovery');
      history.replaceState(null, '', u);
      emergencyBoot = false;
      location.reload();
    } catch {
      setUpdateUI('offline', t('update.failedInstall'));
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(async () => { if (emergencyBoot) await repairEmergencyBoot(); else checkForUpdates({ quiet: true }); })
      .catch(() => { if (!emergencyBoot) checkForUpdates({ quiet: true }); });
  } else if (!emergencyBoot) {
    checkForUpdates({ quiet: true });
  }
})();
