  function getStoredDataRaw() {
    // Primary history moved to IndexedDB in v1.8.0. This legacy key is read only
    // during one-time migration from older releases.
    try { return localStorage.getItem(DATA_KEY); } catch { return null; }
  }

  async function persistFullResetAtomic(empty) {
    // Clear every record and internal snapshot in ONE IndexedDB transaction.
    // If it aborts, the existing data remains intact instead of being partially erased.
    const db = await openAppDb();
    const stores = ['state','records','deletedFasts','weights','deletedWeights','snapshotMeta','snapshotPayload'];
    if (stores.some(name => !db.objectStoreNames.contains(name))) throw new Error('Missing reset data store');
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      const state = tx.objectStore('state');
      state.clear();
      state.put({key:'settings', storageGeneration:STORAGE_GENERATION, data:dataSettingsOnly(empty)});
      state.put({key:'dailyTotals', revision:empty.revision, entries:[]});
      const savedAt = new Date().toISOString();
      state.put({key:'persistenceMeta', lastSuccessfulSaveAt:savedAt, revision:empty.revision});
      for (const name of stores.slice(1)) tx.objectStore(name).clear();
      tx.oncomplete = () => {
        persistedRecordMap = new Map(); persistedDeletedFastMap = new Map();
        persistedWeightMap = new Map(); persistedDeletedWeightMap = new Map();
        lastSuccessfulIdbSaveAt = savedAt;
        try { localStorage.setItem(DATA_REVISION_SIGNAL_KEY, JSON.stringify({revision:empty.revision, at:Date.now()})); } catch {}
        resolve(true);
      };
      tx.onerror = () => reject(tx.error || new Error('IndexedDB reset transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB reset transaction aborted'));
    });
  }

  function dataSettingsOnly(source = data) {
    const out = {...source};
    delete out.records; delete out.deletedFasts; delete out.weights; delete out.deletedWeights;
    return out;
  }

  function recordMap(list) { return new Map((Array.isArray(list) ? list : []).map(item => [item.id, item])); }
  function sameStoredValue(a, b) { return a === b || (a && b && JSON.stringify(a) === JSON.stringify(b)); }

  async function loadRecordBasedSnapshot() {
    const db = await openAppDb();
    const storeNames = ['state','records','deletedFasts','weights','deletedWeights'];
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, 'readonly');
      const state = tx.objectStore('state');
      const result = {settingsRow:null, dailyTotals:null, records:[], deletedFasts:[], weights:[], deletedWeights:[]};
      const read = (store, key, field) => {
        const request = key === undefined ? store.getAll() : store.get(key);
        request.onsuccess = () => { result[field] = request.result ?? (key === undefined ? [] : null); };
        request.onerror = () => { try { tx.abort(); } catch {} };
      };
      read(state, 'settings', 'settingsRow');
      read(state, 'dailyTotals', 'dailyTotals');
      read(tx.objectStore('records'), undefined, 'records');
      read(tx.objectStore('deletedFasts'), undefined, 'deletedFasts');
      read(tx.objectStore('weights'), undefined, 'weights');
      read(tx.objectStore('deletedWeights'), undefined, 'deletedWeights');
      tx.oncomplete = () => {
        const settingsRow = result.settingsRow;
        if (!settingsRow?.data) { resolve(null); return; }
        // All authoritative record stores and their revisioned daily aggregate
        // are read from one IndexedDB snapshot, preventing mixed-tab revisions.
        const marker = settingsRow.storageGeneration;
        const generation = marker == null ? STORAGE_GENERATION : Number(marker);
        if (!Number.isInteger(generation) || generation < MIN_DIRECT_STORAGE_GENERATION || generation > STORAGE_GENERATION) {
          reject(new Error('unsupported storage generation'));
          return;
        }
        loadedStorageGeneration = generation;
        recordStoreGenerationMarkerMissing = marker == null;
        resolve({
          data:{...cloneDefault(), ...settingsRow.data, records:result.records, deletedFasts:result.deletedFasts, weights:result.weights, deletedWeights:result.deletedWeights},
          dailyTotals:result.dailyTotals
        });
      };
      tx.onerror = () => reject(tx.error || new Error('IndexedDB snapshot read failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB snapshot read aborted'));
    });
  }

  async function loadCompatibleStorageSource() {
    const recordSnapshot = await loadRecordBasedSnapshot();
    const recordBased = recordSnapshot?.data || null;
    if (recordBased) return {data:recordBased, dailyTotals:recordSnapshot.dailyTotals, source:'record-stores', generation:loadedStorageGeneration, current:true};
    if (MIN_DIRECT_STORAGE_GENERATION <= 2) {
      const primary = await idbGet('state', 'primary');
      if (primary?.data) return {data:validateCompatibleData(primary.data).data, source:'indexeddb-primary', generation:2, current:false};
    }
    if (MIN_DIRECT_STORAGE_GENERATION <= 1) {
      const legacyRaw = getStoredDataRaw();
      if (legacyRaw) return {data:validateCompatibleData(JSON.parse(legacyRaw)).data, source:'localstorage', generation:1, current:false};
    }
    return {data:null, source:'empty', generation:STORAGE_GENERATION, current:true};
  }

  function recordStorageMigration(source) {
    if (!source || source.current || source.generation >= STORAGE_GENERATION) return;
    const meta = readAppMeta();
    meta.lastStorageMigration = {
      fromGeneration:source.generation, toGeneration:STORAGE_GENERATION, source:source.source,
      completedAt:new Date().toISOString()
    };
    writeAppMeta(meta);
  }

  function noteDiagnosticError(code) {
    const safe = String(code || 'unknown').replace(/[^a-z0-9_.-]/gi,'').slice(0,60) || 'unknown';
    diagnosticErrors.push({code:safe, at:new Date().toISOString()});
    if (diagnosticErrors.length > 20) diagnosticErrors.splice(0, diagnosticErrors.length - 20);
  }

  window.addEventListener('error',event=>{try{noteDiagnosticError('runtime.'+FTPlatform.errorCategory(event.error||event.message));}catch{}});
  window.addEventListener('unhandledrejection',event=>{try{noteDiagnosticError('promise.'+FTPlatform.errorCategory(event.reason));}catch{}});

  async function persistRecordStores(snapshotData = data, {force = false} = {}) {
    // Ordinary writes may not silently erase an established collection.
    // Intentional deletions append an audit record; explicit validated imports
    // and resets use force:true. Check each collection independently so loss of
    // only fasting OR weight history is also detected.
    if (!force && (
      (persistedRecordMap.size > 0 && snapshotData.records.length === 0 &&
       snapshotData.deletedFasts.length <= persistedDeletedFastMap.size) ||
      (persistedWeightMap.size > 0 && snapshotData.weights.length === 0 &&
       snapshotData.deletedWeights.length <= persistedDeletedWeightMap.size)
    )) {
      noteDiagnosticError('history-loss-prevented');
      throw new Error('History-loss safeguard: refusing unaudited history deletion');
    }
    const db = await openAppDb();
    const stores = ['state','records','deletedFasts','weights','deletedWeights'];
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      const state = tx.objectStore('state');
      const targetRecordMap = recordMap(snapshotData.records), targetDeletedFastMap = recordMap(snapshotData.deletedFasts), targetWeightMap = recordMap(snapshotData.weights), targetDeletedWeightMap = recordMap(snapshotData.deletedWeights);
      const collections = [
        ['records', targetRecordMap, persistedRecordMap],
        ['deletedFasts', targetDeletedFastMap, persistedDeletedFastMap],
        ['weights', targetWeightMap, persistedWeightMap],
        ['deletedWeights', targetDeletedWeightMap, persistedDeletedWeightMap]
      ];
      state.put({key:'settings', storageGeneration:STORAGE_GENERATION, data:dataSettingsOnly(snapshotData)});
      state.put({key:'dailyTotals', revision:snapshotData.revision, entries:[...storedDayTotalsMap.entries()]});
      for (const [storeName, next, previous] of collections) {
        const store = tx.objectStore(storeName);
        if (force) store.clear();
        else for (const id of previous.keys()) if (!next.has(id)) store.delete(id);
        for (const [id, value] of next) if (force || !sameStoredValue(previous.get(id), value)) store.put(value);
      }
      const savedAt = new Date().toISOString();
      state.put({key:'persistenceMeta', lastSuccessfulSaveAt:savedAt, revision:snapshotData.revision});
      tx.oncomplete = () => {
        persistedRecordMap = targetRecordMap;
        persistedDeletedFastMap = targetDeletedFastMap;
        persistedWeightMap = targetWeightMap;
        persistedDeletedWeightMap = targetDeletedWeightMap;
        lastSuccessfulIdbSaveAt = savedAt;
        resolve(true);
      };
      tx.onerror = () => reject(tx.error || new Error('IndexedDB record persistence failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB record persistence aborted'));
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
    // Daily totals are derived data. Recompute from authoritative fasting records
    // rather than accumulating add/subtract deltas, which can drift over time.
    storedDayTotalsMap = buildStoredDayTotals(data.records);
    dayTotalsRecordMap = recordMap(data.records);
  }

  function persistSmallPreferences() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        language: normalizeLanguage(data.language),
        appearance: normalizeAppearance(data.appearance),
        iconChoice: normalizeIconChoice(data.iconChoice),
        weightUnit: normalizeWeightUnit(data.weightUnit),
        timeZone: preferredTimeZone && isValidTimeZone(preferredTimeZone) ? preferredTimeZone : 'system',
        gamificationEnabled: data.gamificationEnabled !== false
      }));
    } catch {}
  }

  async function persistDailyTotals(revision = data.revision) {
    await idbPut('state', {key:'dailyTotals', revision, algorithmVersion:DAILY_TOTALS_ALGORITHM_VERSION, entries:[...storedDayTotalsMap.entries()]});
  }

  async function persistPrimaryNow(snapshotData = data, options = {}) {
    persistSmallPreferences();
    try {
      await persistRecordStores(snapshotData, options);
      try { localStorage.setItem(DATA_REVISION_SIGNAL_KEY, JSON.stringify({revision:snapshotData.revision, at:Date.now()})); } catch {}
      return true;
    } catch (err) {
      noteDiagnosticError('idb_save_failed');
      throw err;
    }
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

  async function encodeSnapshotPayload(snapshotData) {
    const json = JSON.stringify(snapshotData);
    if (typeof CompressionStream === 'function') {
      try {
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
        const blob = await new Response(stream).blob();
        return {encoding:'gzip-json', blob, originalBytes:new Blob([json]).size, storedBytes:blob.size};
      } catch {}
    }
    return {encoding:'json', json, originalBytes:new Blob([json]).size, storedBytes:new Blob([json]).size};
  }

  async function decodeSnapshotPayload(row) {
    if (!row) return null;
    if (row.data) return row.data; // v1.8.x compatibility
    if (row.encoding === 'json' && typeof row.json === 'string') return JSON.parse(row.json);
    if (row.encoding === 'gzip-json' && row.blob && typeof DecompressionStream === 'function') {
      const text = await new Response(row.blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
      return JSON.parse(text);
    }
    return null;
  }

  async function persistSnapshotRecord(meta, snapshotData) {
    const payload = await encodeSnapshotPayload(snapshotData);
    const enriched = {
      ...meta,
      payloadEncoding:payload.encoding, originalBytes:payload.originalBytes, storedBytes:payload.storedBytes,
      fastingRecords:Array.isArray(snapshotData.records)?snapshotData.records.length:0,
      deletedFasts:Array.isArray(snapshotData.deletedFasts)?snapshotData.deletedFasts.length:0,
      weightRecords:Array.isArray(snapshotData.weights)?snapshotData.weights.length:0,
      deletedWeights:Array.isArray(snapshotData.deletedWeights)?snapshotData.deletedWeights.length:0,
      activeFasts:snapshotData.activeStart?1:0
    };
    const db = await openAppDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['snapshotMeta','snapshotPayload'], 'readwrite');
      tx.objectStore('snapshotMeta').put(enriched);
      tx.objectStore('snapshotPayload').put({id:meta.id, ...payload});
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Atomic snapshot write failed'));
      tx.onabort = () => reject(tx.error || new Error('Atomic snapshot write aborted'));
    });
    Object.assign(meta, enriched);
  }

  async function deleteSnapshotRecord(id) {
    const db = await openAppDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['snapshotMeta','snapshotPayload'], 'readwrite');
      tx.objectStore('snapshotMeta').delete(id);
      tx.objectStore('snapshotPayload').delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Atomic snapshot delete failed'));
      tx.onabort = () => reject(tx.error || new Error('Atomic snapshot delete aborted'));
    });
  }

  async function loadSnapshotPayload(id) {
    const row = await idbGet('snapshotPayload', id);
    return decodeSnapshotPayload(row);
  }

  async function initializePersistentStorage() {
    try {
      const storageSource = await loadCompatibleStorageSource();
      const recordBased = storageSource.current && storageSource.source === 'record-stores' ? storageSource.data : null;
      let loaded = storageSource.data;
      let canonicalizedStored = false;
      if (loaded) {
        // Current record stores are already canonical. Older supported generations
        // are validated exactly once and then rewritten into generation 3.
        if (storageSource.current && loaded.dataVersion === DATA_VERSION && Array.isArray(loaded.records) && Array.isArray(loaded.deletedFasts) && Array.isArray(loaded.weights) && Array.isArray(loaded.deletedWeights) && loaded.records.length <= MAX_IMPORT_FASTS && loaded.deletedFasts.length <= MAX_IMPORT_DELETED_FASTS && loaded.weights.length <= MAX_IMPORT_WEIGHTS) data = loaded;
        else {
          const prepared = validateCompatibleData(loaded);
          data = prepared.data;
          canonicalizedStored = prepared.changed;
        }
      } else data = cloneDefault();

      // Internal recovery snapshots are intentionally not a long-term interchange
      // format. Only current IndexedDB snapshots are retained; obsolete localStorage
      // snapshots are discarded during cleanup. External JSON backups are the
      // supported long-term recovery path.
      snapshotCache = pruneSnapshots((await idbGetAll('snapshotMeta')).map(normalizeSnapshot).filter(Boolean));

      const daily = storageSource.dailyTotals || await idbGet('state', 'dailyTotals');
      if (daily && Number(daily.revision) === Number(data.revision) && Number(daily.algorithmVersion) === DAILY_TOTALS_ALGORITHM_VERSION && Array.isArray(daily.entries)) storedDayTotalsMap = new Map(daily.entries);
      else {
        storedDayTotalsMap = buildStoredDayTotals(data.records);
        await persistDailyTotals(data.revision);
      }
      persistedRecordMap = recordBased ? recordMap(data.records) : new Map();
      persistedDeletedFastMap = recordBased ? recordMap(data.deletedFasts) : new Map();
      persistedWeightMap = recordBased ? recordMap(data.weights) : new Map();
      persistedDeletedWeightMap = recordBased ? recordMap(data.deletedWeights) : new Map();
      dayTotalsRecordMap = recordMap(data.records);
      const persistenceMeta = await idbGet('state', 'persistenceMeta');
      lastSuccessfulIdbSaveAt = persistenceMeta?.lastSuccessfulSaveAt || null;
      persistSmallPreferences();

      if (!storageSource.current || canonicalizedStored) {
        await persistPrimaryNow(data, {force:true});
        try { await idbDelete('state', 'primary'); } catch {}
        recordStorageMigration(storageSource);
      } else if (recordStoreGenerationMarkerMissing) {
        // Stamp pre-v1.11.4 record-store installs without rewriting history.
        await idbPut('state', {key:'settings', storageGeneration:STORAGE_GENERATION, data:dataSettingsOnly(data)});
        recordStoreGenerationMarkerMissing = false;
      }
      // Remove obsolete large legacy payloads once current storage is available.
      // Legacy internal snapshots are intentionally not migrated.
      try { localStorage.removeItem(DATA_KEY); localStorage.removeItem(SNAPSHOT_KEY); } catch {}

      let appMeta = {};
      try { appMeta = JSON.parse(localStorage.getItem(APP_META_KEY) || '{}') || {}; } catch {}
      const pending = appMeta.pendingMigration;
      const controlledPreUpdateSnapshot = !!(pending && pending.to === APP_VERSION && pending.snapshotId && snapshotCache.some(x => x.id === pending.snapshotId));
      if (appMeta.lastAppVersion !== APP_VERSION && hasBackupWorthyData() && !controlledPreUpdateSnapshot) {
        const sourceVersion = appMeta.lastAppVersion || 'previous version';
        const ok = await createInternalSnapshotAsync(`before first launch of v${APP_VERSION}`, sourceVersion);
        if (!ok) return false;
      }
      finalizePendingMigrationSuccess();
      return true;
    } catch (err) {
      recoveryMode = { raw:'', error:String(err && err.message || err), enteredAt:new Date().toISOString() };
      data = cloneDefault(); snapshotCache = []; storedDayTotalsMap = new Map(); persistedRecordMap = new Map();
      return false;
    }
  }

  // Snapshot lifecycle is defined in 11-recovery-snapshots.js.

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
      lastExternalBackupRevision: Math.max(0, Number(meta.lastExternalBackupRevision) || 0),
      lastExternalBackupDataUpdatedAt: validDate(meta.lastExternalBackupDataUpdatedAt)?.toISOString() || null,
      lastExternalBackupDataSignature: typeof meta.lastExternalBackupDataSignature === 'string' && /^v1:[0-9a-f]{16}$/.test(meta.lastExternalBackupDataSignature) ? meta.lastExternalBackupDataSignature : null,
      lastExternalBackupFastingSignature: typeof meta.lastExternalBackupFastingSignature==='string' && /^v1:[0-9a-f]{16}$/.test(meta.lastExternalBackupFastingSignature) ? meta.lastExternalBackupFastingSignature : null,
      lastExternalBackupWeightSignature: typeof meta.lastExternalBackupWeightSignature==='string' && /^v1:[0-9a-f]{16}$/.test(meta.lastExternalBackupWeightSignature) ? meta.lastExternalBackupWeightSignature : null,
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

  // Data-format normalization and import validation are owned by 14-data-validation.js.

  function load() { return data; }

  function invalidateDerivedCaches() {
    completedDayMapCache = null;
    currentStreakCache = null;
    statsSummaryCache = null;
    currentZoneDaySummaryCache = null;
    statsVizRendered.clear();
    trendChartDaysCache = null;
    weeklySummariesCache = null;
    monthSummariesCache = null;
    durationDistributionCache = null;
    targetSuccessCache = null;
    startPatternCache = null;
    cumulativeDaysCache = null;
    calendarDaysCache.clear();
    weightAggregateCache.clear();
    weightChartScaleCache = null;
    weightChartBuckets = [];
    latestCompletedFastCache = undefined;
    sortedRecordsDescCache = null;
    sortedRecordsAscCache = null;
    sortedWeightsAscCache = null;
  }

  function markViewsDirty(...views) {
    const targets = views.length ? views : Object.keys(viewDirty);
    for (const view of targets) if (Object.prototype.hasOwnProperty.call(viewDirty, view)) viewDirty[view] = true;
  }

  async function reloadFromIndexedDB({ notify = false } = {}) {
    if (recoveryMode) return false;
    try {
      const recordSnapshot = await loadRecordBasedSnapshot();
      const next = recordSnapshot?.data || cloneDefault();
      const openModal = visibleModal();
      const activeField = document.activeElement;
      const interruptedEdit = !!(editingRecordId || editingWeightId ||
        (openModal && (openModal.id === 'entryModal' || openModal.id === 'weightModal' || openModal.id === 'backdateModal' || openModal.id === 'activeTargetModal')) ||
        activeField === goalHours || activeField === el('weightTargetInput') || activeField === el('activeTargetInput'));
      if (!Array.isArray(next.deletedFasts)) next.deletedFasts = [];
      if (!Array.isArray(next.deletedWeights)) next.deletedWeights = [];
      data = next;
      const daily = recordSnapshot?.dailyTotals;
      storedDayTotalsMap = daily && Number(daily.revision) === Number(data.revision) && Array.isArray(daily.entries)
        ? new Map(daily.entries) : buildStoredDayTotals(data.records);
      persistedRecordMap = recordMap(data.records);
      persistedDeletedFastMap = recordMap(data.deletedFasts);
      persistedWeightMap = recordMap(data.weights);
      persistedDeletedWeightMap = recordMap(data.deletedWeights);
      historyVisibleCount = HISTORY_PAGE_SIZE;
      deletedHistoryVisibleCount = HISTORY_PAGE_SIZE;
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

  async function persistResolvedDataAtomic(candidate) {
    if (recoveryMode && candidate !== defaultData) { /* recovery restore is allowed below */ }
    const previous = {data, storedDayTotalsMap, dayTotalsRecordMap, persistedRecordMap, persistedDeletedFastMap, persistedWeightMap, persistedDeletedWeightMap, recoveryMode};
    try {
      const normalized = validateCompatibleData(candidate).data;
      normalized.revision = Math.max(0, Number(normalized.revision) || 0) + 1;
      normalized.updatedAt = new Date().toISOString();
      data = normalized;
      storedDayTotalsMap = buildStoredDayTotals(data.records); dayTotalsRecordMap = recordMap(data.records);
      recoveryMode = null; invalidateDerivedCaches();
      await persistRecordStores(data, {force:true});
      // Keep the local preference mirror in step with the committed IndexedDB
      // restore. A failed transaction must not leave attempted settings behind.
      persistSmallPreferences();
      try { localStorage.setItem(DATA_REVISION_SIGNAL_KEY, JSON.stringify({revision:data.revision, at:Date.now()})); } catch {}
      rememberCurrentAppVersion(); markViewsDirty();
      return true;
    } catch (err) {
      ({data, storedDayTotalsMap, dayTotalsRecordMap, persistedRecordMap, persistedDeletedFastMap, persistedWeightMap, persistedDeletedWeightMap, recoveryMode} = previous);
      noteDiagnosticError('atomic_commit_failed'); alert(t('error.save')); return false;
    }
  }

  function persistResolvedData(candidate) {
    try {
      const normalized = validateCompatibleData(candidate).data;
      normalized.revision = Math.max(0, Number(normalized.revision) || 0) + 1;
      normalized.updatedAt = new Date().toISOString();
      data = normalized;
      storedDayTotalsMap = buildStoredDayTotals(data.records);
      dayTotalsRecordMap = recordMap(data.records);
      recoveryMode = null;
      invalidateDerivedCaches();
      rememberCurrentAppVersion();
      persistSmallPreferences();
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
      if (!Array.isArray(data.records) || !Array.isArray(data.deletedFasts) || !Array.isArray(data.weights) || !Array.isArray(data.deletedWeights) || data.records.length > MAX_IMPORT_FASTS || data.deletedFasts.length > MAX_IMPORT_DELETED_FASTS || data.weights.length > MAX_IMPORT_WEIGHTS || data.deletedWeights.length > MAX_IMPORT_WEIGHTS) throw new Error('record limit exceeded');
      const fastingHistoryMayHaveChanged = !Array.isArray(dirtyViews) || dirtyViews.includes('history') || dirtyViews.includes('fasting');
      if (fastingHistoryMayHaveChanged) updateStoredDayTotalsIncrementally();
      data.revision = Math.max(0, Number(data.revision) || 0) + 1;
      data.updatedAt = new Date().toISOString();
      if (invalidateDerived) invalidateDerivedCaches();
      markViewsDirty(...(Array.isArray(dirtyViews) ? dirtyViews : ['fasting','history','weight','stats','settings']));
      persistSmallPreferences();
      queuePrimaryPersistence();
      if (deferSnapshot) scheduleRollingSnapshot('automatic change');
      else maybeCreateRollingSnapshot('automatic change');
      if (uiReady) renderBackupStatus();
      return true;
    } catch {
      alert(t('error.save'));
      return false;
    }
  }

