
(async () => {
  'use strict';

  const DATA_KEY = 'fastingTracker.data'; // legacy migration only
  const SNAPSHOT_KEY = 'fastingTracker.snapshots'; // legacy migration only
  const DATA_REVISION_SIGNAL_KEY = 'fastingTracker.dataRevision';
  const PREFS_KEY = 'fastingTracker.preferences';
  const IDB_NAME = 'FastingTrackerDB';
  const IDB_VERSION = 2;
  // Storage compatibility is intentionally bounded for this single-user app.
  // Generation 3 = current record stores; 2 = legacy single-object IndexedDB; 1 = legacy localStorage.
  const STORAGE_GENERATION = 3;
  const MIN_DIRECT_STORAGE_GENERATION = Math.max(1, STORAGE_GENERATION - 2);
  const BACKUP_META_KEY = 'fastingTracker.backupMeta';
  const APP_META_KEY = 'fastingTracker.appMeta';
  const INSTALL_NOTICE_KEY = 'fastingTracker.installStorageNoticeDismissed';
  const SETUP_GUIDE_KEY = 'fastingTracker.setupGuide';
  const SETUP_GUIDE_VERSION = 1;
  const LONG_FAST_NOTICE_KEY = 'fastingTracker.longFastNoticeSeen';
  const DOC_RETURN_KEY = 'fastingTracker.documentReturnUrl';
  const NOTIFICATION_STATE_KEY = 'fastingTracker.notificationState';
  const NOTIFICATION_DETAIL_LIMIT = 5;
  const NOTIFICATION_DETAIL_TTL_MS = 14 * 24 * 60 * 60 * 1000;
  const DATA_VERSION = 1;
  // Bump when the daily-total cache calculation or storage semantics change.
  const DAILY_TOTALS_ALGORITHM_VERSION = 2;
  const BACKUP_FORMAT = 'fasting-tracker-backup';
  const BACKUP_VERSION = 2;
  const BACKUP_MIN_VERSION = 1; // Keep one older external-backup generation importable.
  // Increment only when canonical English source wording intentionally changes.
  const I18N_SOURCE_REVISION = 38;
  const LANGUAGE_META = Object.freeze({
    en: Object.freeze({ locale: 'en', dir: 'ltr', label: 'English', manifestSuffix: '', appTitle: 'Fasting' }),
    bg: Object.freeze({ locale: 'bg', dir: 'ltr', label: 'Български', manifestSuffix: '-bg', appTitle: 'Гладуване' }),
    es: Object.freeze({ locale: 'es', dir: 'ltr', label: 'Español', manifestSuffix: '-es', appTitle: 'Ayuno' })
  });
  const SUPPORTED_LANGUAGES = Object.freeze(Object.keys(LANGUAGE_META));
  const APP_VERSION = '@@FT_APP_VERSION@@';
  const UPDATE_PROTOCOL_VERSION = 1;
  const FUTURE_TOLERANCE_MS = 60 * 1000;
  const SNAPSHOT_RECENT_KEEP = 5;
  const SNAPSHOT_DAILY_KEEP = 7;
  const SNAPSHOT_WEEKLY_KEEP = 4;
  const SNAPSHOT_MONTHLY_KEEP = 6;
  const SNAPSHOT_SCAN_LIMIT = 80;
  const BACKUP_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;
  const STORAGE_PRESSURE_RATIO = 0.80;
  const STORAGE_PRESSURE_FREE_BYTES = 50 * 1024 * 1024;
  const UNDO_WINDOW_MS = 7000;
  const PERF_META_KEY = 'fastingTracker.performance';
  const UPDATE_STATUS_META_KEY = 'fastingTracker.updateStatus';
  const CHART_RANGE_KEY = 'fastingTracker.chartRanges';
  const STATS_VIZ_PREF_KEY = 'fastingTracker.statsVizSelection';
  const SETTINGS_GROUPS_KEY = 'fastingTracker.settingsGroups';
  const STATS_VIZ_GROUPS = Object.freeze({
    overview: Object.freeze(['timeline','calendar','trend','weeks']),
    timing: Object.freeze(['startpattern','distribution']),
    goals: Object.freeze(['success','months']),
    longterm: Object.freeze(['cumulative'])
  });
  const DEFAULT_CHART_RANGES=Object.freeze({trend:'30d',months:'1y',distribution:'all',success:'1y',startpattern:'all',cumulative:'90d'});
  const LONG_FAST_NOTICE_HOURS = 72;
  const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
  const MAX_IMPORT_FASTS = 100000;
  const MAX_IMPORT_WEIGHTS = 100000;
  const MAX_IMPORT_DELETED_FASTS = 100000;
  const MAX_FAST_EDIT_AUDIT = 100;
  const HISTORY_PAGE_SIZE = 50;
  const MAX_DATE_MS = 8.64e15;
  // Fixed conservative ceiling keeps target-date arithmetic inside ECMAScript Date's representable range.
  const MAX_SAFE_GOAL_HOURS = 2_000_000_000;
  const defaultData = { dataVersion: DATA_VERSION, revision: 0, updatedAt: null, goalHours: 16, activeStart: null, activeGoalHours: null, activeTimeZone: null, activeCreatedAt: null, activeModifiedAt: null, records: [], deletedFasts: [], weights: [], deletedWeights: [], weightUnit: 'kg', targetWeightKg: null, gamificationEnabled: true, notificationPreferences: { enabled: false, targetReached: true, backupDue: true, longFastSafety: true, weighIn: false, weighInCadence: 'weekly', cycleComplete: false }, language: 'system', appearance: 'system', iconChoice: 'plate' };
  const timeZoneValidityCache = new Map();
  const numberSymbolsCache = new Map();
  let preferredTimeZone = null;
  try {
    const savedPreferences = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (savedPreferences && savedPreferences.timeZone && savedPreferences.timeZone !== 'system') preferredTimeZone = String(savedPreferences.timeZone);
  } catch {}
  const zonedFormatterCache = new Map();
  // Initialize URL-dependent UI state and a safe default data object before loading
  // persisted data. Legacy-number normalization may ask currentLocale() ->
  // uiLanguage() during load(), so these bindings must never be in the TDZ.
  const initialUrlParams = new URLSearchParams(location.search);
  let initialAppMeta = {};
  try { initialAppMeta = JSON.parse(localStorage.getItem(APP_META_KEY) || '{}') || {}; } catch { initialAppMeta = {}; }
  const hadKnownInstallAtBoot = typeof initialAppMeta.lastAppVersion === 'string' && initialAppMeta.lastAppVersion.length > 0;
  let emergencyBoot = initialUrlParams.get('ft_recovery') === '1';
  let urlLangOverride = SUPPORTED_LANGUAGES.includes(initialUrlParams.get('lang')) ? initialUrlParams.get('lang') : null;
  let urlIconOverride = ['plate','moon','hourglass','timer','grayscale','highcontrast','colorblind'].includes(initialUrlParams.get('icon')) ? initialUrlParams.get('icon') : null;
  let data = cloneDefault();
  let recoveryMode = null;
  let backupMeta = loadBackupMeta();
  let snapshotProtectionState = {
    status: ['ok','reduced','failed'].includes(backupMeta.snapshotProtectionStatus) ? backupMeta.snapshotProtectionStatus : 'ok',
    kept: Math.max(0, Number(backupMeta.snapshotStoredCount) || 0),
    desired: Math.max(0, Number(backupMeta.snapshotDesiredCount) || 0)
  };
  let automaticSnapshotFailureAlerted = false;
  let loadedStorageGeneration = STORAGE_GENERATION;
  let recordStoreGenerationMarkerMissing = false;
  let deferredSnapshotTicket = 0;
  let snapshotCache = [];
  let storedDayTotalsMap = new Map();
  let persistedRecordMap = new Map();
  let dayTotalsRecordMap = new Map();
  let persistedDeletedFastMap = new Map();
  let persistedWeightMap = new Map();
  let persistedDeletedWeightMap = new Map();
  let lastSuccessfulIdbSaveAt = null;
  const diagnosticErrors = [];
  let primaryPersistTicket = 0;
  let primaryPersistPromise = Promise.resolve();
  let appDbPromise = null;
  let setupGuideStep = 1;
  let setupStorageResult = null;
  let setupWeightUnitChoice = 'kg';
  let setupGuideAutoOpened = false;
  let notificationRuntimeState = loadNotificationRuntimeState();
  let latestCompletedFastCache = undefined;
  let sortedRecordsDescCache = null;
  let sortedRecordsAscCache = null;
  let sortedWeightsAscCache = null;
  let lastIntegrityCheck = null;
  let lastServiceWorkerHealth = null;
  let liveMetadataVersion = null, liveEntryVersion = null, deploymentConsistencyState = 'unknown', lastUpdateCheckAt = null;
  let monthSummariesCache = null, durationDistributionCache = null, targetSuccessCache = null, startPatternCache = null, cumulativeDaysCache = null;
  let genericChartHitLayout = [];
  let cumulativeInteractiveLayout = [];
  let cumulativeSelectedDayKey = null;
  let cumulativePlotBounds = null;
  let cumulativePointerState = null;
  let statsDrilldownRecordIds = [];
  let chartRanges = loadChartRanges();
  let historyBulkMode = false, weightBulkMode = false;
  const selectedFastIds = new Set(), selectedDeletedFastIds = new Set(), selectedWeightIds = new Set(), selectedDeletedWeightIds = new Set();
  let undoToastTimer = 0, undoToastAction = null;
  const el = id => document.getElementById(id);
  let uiReady = false;
  loadUpdateStatusMeta();
  // Initialise IndexedDB helpers before the first async storage migration.
  // This binding must precede initializePersistentStorage() below.
  const storageDB = window.FTStorageDB.create({IDB_NAME, IDB_VERSION, noteDiagnosticError});
  const {openAppDb, idbRequest, idbGet, idbGetAll, idbPut, idbDelete, idbClear, idbClearStoresAtomic} = storageDB;

  // Initialise shared time primitives before the first async storage migration.
  // Function declarations below are hoisted within this single app-shell scope.
  const timeUtils = window.FTTime.create({
    pad,
    currentLocale,
    currentTimeZone,
    normalizeTimeZone,
    zonedParts,
    timeZoneOffsetMs
  });

  const versionTransitionSnapshotOK = await initializePersistentStorage();
  if (versionTransitionSnapshotOK && !recoveryMode) rememberCurrentAppVersion();

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
  const modalFocusStack = [];
  let pendingSnapshotRestoreId = null;
  let completedDayMapCache = null;
  let currentStreakCache = null;
  let historyVisibleCount = HISTORY_PAGE_SIZE;
  let deletedHistoryVisibleCount = HISTORY_PAGE_SIZE;
  let weightVisibleCount = HISTORY_PAGE_SIZE;
  let fastActionLocked = false;
  let suppressFastToggleUntil = 0;
  let pendingStopUndo = null;
  let stopModalStage = 'confirm';
  let shorterGoalOfferMs = 0;
  let stopUndoTimer = 0;
  let stopUndoCountdownTimer = 0;
  let stopUndoMessageTimer = 0;
  let weightChartHitPoints = [];
  let weightChartSelectedId = null;
  let weightChartPointerStart = null;
  let weightChartScrollFrame = 0;
  let weightChartProgrammaticScrollLeft = null;
  let weightChartScrollToLatestPending = true;
  let weightChartBuckets = [];
  let weightAggregateCache = new Map();
  let weightChartScaleCache = null;
  let weightPeriodMode = 'daily';
  let chartInteractiveLayout = [];
  let timelineChartGeometry = null;
  let timelineChartDays = [];
  let chartSelectedTarget = null;
  let statsVizPrefs = loadStatsVizPrefs();
  let statsVizGroup = statsVizPrefs.activeGroup;
  let statsVizMode = statsVizPrefs.lastByGroup[statsVizGroup] || STATS_VIZ_GROUPS[statsVizGroup][0];
  let statsCalendarMonthOffset = 0;
  let calendarFocusDayKey = null;
  let statsDetailOverride = null;
  let trendInteractiveLayout = [];
  let trendPlotBounds = null;
  let weekInteractiveLayout = [];
  let genericChartSelectedKey = null;
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
  function normalizeAppearance(value) { return ['system','light','dark','grayscale','high-contrast-light','high-contrast-dark','colorblind','protanopia','deuteranopia','tritanopia'].includes(value) ? value : 'system'; }
  function normalizeIconChoice(value) { return ['plate','moon','hourglass','timer','grayscale','highcontrast','colorblind'].includes(value) ? value : 'plate'; }
  function manifestFor(lang, icon) {
    icon = normalizeIconChoice(icon);
    lang = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'en';
    const suffix = LANGUAGE_META[lang].manifestSuffix;
    return icon === 'plate' ? `manifest${suffix}.webmanifest` : `manifest-${icon}${suffix}.webmanifest`;
  }
  function applyIconChoice() { const icon=normalizeIconChoice(urlIconOverride || data?.iconChoice); const lang=uiLanguage(); const manifest=el('appManifest'); if(manifest) manifest.href=manifestFor(lang,icon); const accessibleIcon=['grayscale','highcontrast','colorblind'].includes(icon); const fav=el('appFavicon'); if(fav) fav.href=accessibleIcon ? `icons/${icon}/icon-192.png` : `icons/${icon}/favicon-32.png`; const touch=el('appleTouchIcon'); if(touch) touch.href=accessibleIcon ? `icons/${icon}/icon-192.png` : `icons/${icon}/apple-touch-icon.png`; document.querySelectorAll('.iconChoice[data-icon-choice]').forEach(btn=>{ const active=btn.dataset.iconChoice===icon; btn.classList.toggle('active',active); btn.setAttribute('aria-checked',active?'true':'false'); }); }
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
  function updateAppearancePaletteHint() {
    const select = document.getElementById('appearanceSelect');
    const hint = document.getElementById('appearancePaletteHint');
    if (!select || !hint) return;
    const key = ({ colorblind:'settings.paletteHint.colorblind', protanopia:'settings.paletteHint.protanopia', deuteranopia:'settings.paletteHint.deuteranopia', tritanopia:'settings.paletteHint.tritanopia' })[select.value];
    hint.hidden = !key;
    if (key) hint.textContent = t(key);
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
  const timeZoneLocationRecords = Array.isArray(window.FT_TIME_ZONE_LOCATIONS) ? window.FT_TIME_ZONE_LOCATIONS : [];
  const timeZoneLocationById = (() => { const map=new Map(); for(const r of timeZoneLocationRecords){map.set(r.z,r);for(const alias of r.g||[])map.set(alias,r);}return map; })();
  const timeZonePopularChoices = ['Europe/Sofia','America/New_York','Europe/London','Asia/Tokyo','Australia/Sydney','Asia/Dubai','America/Sao_Paulo','Asia/Kolkata','Africa/Johannesburg','UTC'];
  function normalizeTimeZoneSearch(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/_/g,' ').toLocaleLowerCase().replace(/\s+/g,' ').trim();}
  function localizedTimeZoneContinent(r){const n={en:{AF:'Africa',AS:'Asia',EU:'Europe',NA:'North America',SA:'South America',OC:'Oceania',AN:'Antarctica'},bg:{AF:'Африка',AS:'Азия',EU:'Европа',NA:'Северна Америка',SA:'Южна Америка',OC:'Океания',AN:'Антарктида'},es:{AF:'África',AS:'Asia',EU:'Europa',NA:'América del Norte',SA:'América del Sur',OC:'Oceanía',AN:'Antártida'}};return n[uiLanguage()]?.[r?.ccn]||r?.ct||'';}
  function timeZoneLocationInfo(zone){
    const r=timeZoneLocationById.get(zone);if(!r){const label=String(zone).replace(/_/g,' ');return {label,search:label};}
    const city=r.ci?.[0]||r.z.split('/').pop().replace(/_/g,' ');let country=r.c||'';
    try{if(r.cc&&typeof Intl.DisplayNames==='function')country=new Intl.DisplayNames([uiLanguage()],{type:'region'}).of(r.cc)||country;}catch{}
    const zoneLabel=r.z.replace(/_/g,' ');
    return {label:zone==='UTC'?'UTC':`${city}, ${country} — ${zoneLabel}`,search:[zone,zoneLabel,...(r.g||[]),r.c,country,r.ct,localizedTimeZoneContinent(r),...(r.ci||[]),r.a].join(' ')};
  }
  function renderTimeZoneOptions(){
    const sel=document.getElementById('timeZoneSelect');if(!sel)return;
    const selected=preferredTimeZone&&isValidTimeZone(preferredTimeZone)?preferredTimeZone:'system',deviceZone=deviceTimeZone();
    const query=normalizeTimeZoneSearch(document.getElementById('timeZoneSearch')?.value||'');let zones=[];
    try{if(typeof Intl.supportedValuesOf==='function')zones=Intl.supportedValuesOf('timeZone');}catch{}
    zones=[...new Set([...zones,...timeZoneLocationRecords.map(r=>r.z),'UTC',deviceZone,...(selected!=='system'?[selected]:[])])].filter(isValidTimeZone);
    let matches=query?zones.filter(z=>normalizeTimeZoneSearch(timeZoneLocationInfo(z).search).includes(query)):timeZonePopularChoices.filter(z=>zones.includes(z));
    if(query)matches.sort((a,b)=>timeZoneLocationInfo(a).label.localeCompare(timeZoneLocationInfo(b).label,uiLanguage()));
    const total=matches.length,shown=matches.slice(0,15);sel.replaceChildren();
    const sys=document.createElement('option');sys.value='system';sys.textContent=t('settings.timeZoneSystem')+' ('+deviceZone.replace(/_/g,' ')+')';sel.append(sys);
    if(query){const prompt=document.createElement('option');prompt.value='';prompt.disabled=true;prompt.textContent=({en:'Choose a matching time zone…',bg:'Изберете часова зона от резултатите…',es:'Elige una zona horaria de los resultados…'})[uiLanguage()]||'Choose a matching time zone…';sel.append(prompt);}
    if(selected!=='system'&&!shown.includes(selected)){const cur=document.createElement('option');cur.value=selected;cur.textContent=t('settings.timeZoneCurrent')+': '+timeZoneLocationInfo(selected).label;sel.append(cur);}
    for(const z of shown){if(z===selected)continue;const o=document.createElement('option');o.value=z;o.textContent=timeZoneLocationInfo(z).label;sel.append(o);}
    if(selected!=='system'&&shown.includes(selected)){const cur=document.createElement('option');cur.value=selected;cur.textContent=timeZoneLocationInfo(selected).label;sel.insertBefore(cur,sel.children[query?2:1]||null);}
    sel.value=query?'':selected;if(!query&&sel.value!==selected)sel.value='system';
    const status=document.getElementById('timeZoneSearchStatus');if(status){if(query&&total===0)status.textContent=t('settings.timeZoneNoResults');else if(query)status.textContent=t('settings.timeZoneResultsCount',{shown:shown.length,total});else status.textContent=t('settings.timeZoneBrowseHelp');}
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
    document.querySelectorAll('[data-i18n-placeholder]').forEach(node => { node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder)); });
    document.querySelectorAll('[data-i18n-label]').forEach(node => { node.label = t(node.dataset.i18nLabel); });
    updateAppearancePaletteHint();
    syncStatsVizNavigator();
    renderLanguageOptions();
    renderTimeZoneOptions();
    applyIconChoice();
    const appleTitle = document.getElementById('appleAppTitle');
    if (appleTitle) appleTitle.content = meta.appTitle;
    const goalUnit = document.getElementById('goalUnit');
    if (goalUnit) goalUnit.textContent = t('unit.h');
    document.querySelectorAll('.chip[data-goal]').forEach(chip => { chip.textContent = `${formatNumber(Number(chip.dataset.goal))}${t('unit.h')}`; });
    document.querySelectorAll('.chip[data-active-goal]').forEach(chip => { chip.textContent = `${formatNumber(Number(chip.dataset.activeGoal))}${t('unit.h')}`; });
    document.querySelectorAll('.chip[data-setup-goal]').forEach(chip => { chip.textContent = `${formatNumber(Number(chip.dataset.setupGoal))}${t('unit.h')}`; });
    if (!el('setupModal')?.hidden) renderSetupGuide();
  }

  function effectiveAppearance() {
    const pref = normalizeAppearance(data?.appearance || 'system');
    if (pref === 'system') return systemThemeQuery.matches ? 'dark' : 'light';
    return pref === 'dark' || pref === 'high-contrast-dark' ? 'dark' : 'light';
  }
  function applyAppearance() {
    const pref = normalizeAppearance(data?.appearance || 'system');
    if (pref === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', pref);
    const sel = document.getElementById('appearanceSelect');
    if (sel) sel.value = pref;
    // The initial language pass runs before the saved appearance is restored.
    // Refresh the purpose hint after the select reflects the persisted palette.
    updateAppearancePaletteHint();
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
  function deviceTimeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  }
  function currentTimeZone() {
    if (typeof preferredTimeZone !== 'undefined' && preferredTimeZone && isValidTimeZone(preferredTimeZone)) return preferredTimeZone;
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
    const tz = normalizeTimeZone(w.timeZone);
    const whenIso = when.toISOString();
    const calendarDay = typeof w.calendarDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.calendarDay)
      ? w.calendarDay : dayKeyFast(whenIso, tz);
    return {
      id: (typeof w.id === 'string' && w.id.length <= 120) ? w.id : makeId(),
      when: whenIso,
      kg,
      timeZone: tz,
      calendarDay,
      createdAt: normalizeAuditTimestamp(w.createdAt),
      modifiedAt: normalizeAuditTimestamp(w.modifiedAt)
    };
  }

  function normalizeDeletedWeight(w) {
    const weight = normalizeWeightEntry(w);
    const deletedAt = validDate(w?.deletedAt);
    if (!weight || !deletedAt) return null;
    const reason = typeof w.deletionReason === 'string' && w.deletionReason.length <= 80 ? w.deletionReason : 'user';
    return {...weight, deleted:true, deletedAt:deletedAt.toISOString(), deletedTimeZone:normalizeTimeZone(w.deletedTimeZone), deletionReason:reason};
  }

  function normalizeStopReason(value) { return ['personal','business-social','health-safety','travel-unexpected','other-unavoidable'].includes(value) ? value : null; }
  function isExcusedStop(record) { return !!record && !recordMetGoal(record) && ['business-social','health-safety','travel-unexpected','other-unavoidable'].includes(normalizeStopReason(record.stopReason)); }
  function stopReasonLabel(reason) { const key=normalizeStopReason(reason); return key ? t(`fasting.stopReasonLabel.${key}`) : t('fasting.stopReasonUnspecified'); }

  function normalizeFastEditAuditEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const editedAt = validDate(entry.editedAt), start = validDate(entry.start), end = validDate(entry.end);
    if (!editedAt || !start || !end || end <= start) return null;
    return {
      editedAt: editedAt.toISOString(),
      editedTimeZone: normalizeTimeZone(entry.editedTimeZone),
      start: start.toISOString(),
      end: end.toISOString(),
      goalHours: sanitizeGoal(entry.goalHours, 16),
      timeZone: normalizeTimeZone(entry.timeZone),
      stopReason: normalizeStopReason(entry.stopReason)
    };
  }

  function normalizeFastEditHistory(value) {
    if (!Array.isArray(value)) return [];
    return value.map(normalizeFastEditAuditEntry).filter(Boolean).slice(-MAX_FAST_EDIT_AUDIT);
  }

  function formatGoal(hours) {
    const n = sanitizeGoal(hours, 16);
    return `${n.toLocaleString(currentLocale(), { maximumFractionDigits: 3 })} ${t(pluralKey('unit.hour', n))}`;
  }

