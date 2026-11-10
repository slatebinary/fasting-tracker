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

  // App-version and deployment-migration metadata is owned by 12-app-migration-state.js.

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
      modifiedAt: normalizeAuditTimestamp(r.modifiedAt),
      editHistory: normalizeFastEditHistory(r.editHistory),
      stopReason: normalizeStopReason(r.stopReason)
    };
  }

  function normalizeDeletedFast(r) {
    const record = normalizeRecord(r);
    const deletedAt = validDate(r?.deletedAt);
    if (!record || !deletedAt) return null;
    const reason = typeof r.deletionReason === 'string' && r.deletionReason.length <= 80 ? r.deletionReason : 'user';
    return { ...record, deleted: true, deletedAt: deletedAt.toISOString(), deletedTimeZone: normalizeTimeZone(r.deletedTimeZone), deletionReason: reason };
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
      deletedFasts: Array.isArray(parsed.deletedFasts) ? parsed.deletedFasts.map(normalizeDeletedFast).filter(Boolean) : [],
      weights: Array.isArray(parsed.weights) ? parsed.weights.map(normalizeWeightEntry).filter(Boolean) : [],
      deletedWeights: Array.isArray(parsed.deletedWeights) ? parsed.deletedWeights.map(normalizeDeletedWeight).filter(Boolean) : [],
      weightUnit: normalizeWeightUnit(parsed.weightUnit),
      targetWeightKg: sanitizeWeightKg(parsed.targetWeightKg, null),
      gamificationEnabled: parsed.gamificationEnabled !== false,
      notificationPreferences: normalizeNotificationPreferences(parsed.notificationPreferences),
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
    if (candidate.deletedFasts === undefined) { candidate.deletedFasts = []; changed = true; }
    if (candidate.weights === undefined) { candidate.weights = []; changed = true; }
    if (candidate.deletedWeights === undefined) { candidate.deletedWeights = []; changed = true; }

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
    const notificationPreferences = normalizeNotificationPreferences(candidate.notificationPreferences);
    if (JSON.stringify(candidate.notificationPreferences) !== JSON.stringify(notificationPreferences)) { candidate.notificationPreferences = notificationPreferences; changed = true; }
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
        const editHistory = normalizeFastEditHistory(next.editHistory);
        if (!Array.isArray(next.editHistory) || JSON.stringify(next.editHistory) !== JSON.stringify(editHistory)) { next.editHistory = editHistory; changed = true; }
        const stopReason = normalizeStopReason(next.stopReason);
        if ((next.stopReason ?? null) !== stopReason) { next.stopReason = stopReason; changed = true; }
        // Canonicalize valid timestamps without guessing damaged core dates.
        if (start && next.start !== start.toISOString()) { next.start = start.toISOString(); changed = true; }
        if (end && next.end !== end.toISOString()) { next.end = end.toISOString(); changed = true; }
        return next;
      });
    }

    const usedDeletedFastIds = new Set();
    if (Array.isArray(candidate.deletedFasts)) {
      candidate.deletedFasts = candidate.deletedFasts.map((record, index) => {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
        const next = {...record};
        const start = validDate(next.start), end = validDate(next.end);
        const baseId = `deleted-fast-${index + 1}-${start ? start.getTime() : index}`.slice(0, 110);
        let id = typeof next.id === 'string' && next.id && next.id.length <= 120 ? next.id : baseId;
        if (usedDeletedFastIds.has(id)) {
          let suffix = 2;
          while (usedDeletedFastIds.has(`${baseId}-${suffix}`)) suffix++;
          id = `${baseId}-${suffix}`.slice(0, 120);
        }
        usedDeletedFastIds.add(id);
        if (next.id !== id) { next.id = id; changed = true; }
        const goal = sanitizeGoal(next.goalHours, fallbackGoal);
        if (next.goalHours !== goal) { next.goalHours = goal; changed = true; }
        const zone = normalizeTimeZone(next.timeZone, fallbackZone);
        if (next.timeZone !== zone) { next.timeZone = zone; changed = true; }
        for (const key of ['createdAt','modifiedAt']) {
          const audit = normalizeAuditTimestamp(next[key]);
          if (next[key] !== audit) { next[key] = audit; changed = true; }
        }
        const editHistory = normalizeFastEditHistory(next.editHistory);
        if (!Array.isArray(next.editHistory) || JSON.stringify(next.editHistory) !== JSON.stringify(editHistory)) { next.editHistory = editHistory; changed = true; }
        const stopReason = normalizeStopReason(next.stopReason);
        if ((next.stopReason ?? null) !== stopReason) { next.stopReason = stopReason; changed = true; }
        if (start && next.start !== start.toISOString()) { next.start = start.toISOString(); changed = true; }
        if (end && next.end !== end.toISOString()) { next.end = end.toISOString(); changed = true; }
        const deletedAt = validDate(next.deletedAt);
        if (deletedAt && next.deletedAt !== deletedAt.toISOString()) { next.deletedAt = deletedAt.toISOString(); changed = true; }
        if (next.deleted !== true) { next.deleted = true; changed = true; }
        const deletedZone = normalizeTimeZone(next.deletedTimeZone, fallbackZone);
        if (next.deletedTimeZone !== deletedZone) { next.deletedTimeZone = deletedZone; changed = true; }
        const reason = typeof next.deletionReason === 'string' && next.deletionReason.length <= 80 ? next.deletionReason : 'user';
        if (next.deletionReason !== reason) { next.deletionReason = reason; changed = true; }
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

    const usedDeletedWeightIds = new Set();
    if (Array.isArray(candidate.deletedWeights)) {
      candidate.deletedWeights = candidate.deletedWeights.map((weight, index) => {
        if (!weight || typeof weight !== 'object' || Array.isArray(weight)) return weight;
        const next = {...weight};
        const when = validDate(next.when);
        const baseId = `deleted-weight-${index + 1}-${when ? when.getTime() : index}`.slice(0,110);
        let id = typeof next.id === 'string' && next.id && next.id.length <= 120 ? next.id : baseId;
        if (usedDeletedWeightIds.has(id)) { let suffix=2; while (usedDeletedWeightIds.has(`${baseId}-${suffix}`)) suffix++; id=`${baseId}-${suffix}`.slice(0,120); }
        usedDeletedWeightIds.add(id);
        if (next.id !== id) { next.id=id; changed=true; }
        const zone=normalizeTimeZone(next.timeZone,fallbackZone); if(next.timeZone!==zone){next.timeZone=zone;changed=true;}
        const kg=sanitizeWeightKg(next.kg,null); if(kg!=null&&next.kg!==kg){next.kg=kg;changed=true;}
        for (const key of ['createdAt','modifiedAt']) { const audit=normalizeAuditTimestamp(next[key]); if(next[key]!==audit){next[key]=audit;changed=true;} }
        if(when&&next.when!==when.toISOString()){next.when=when.toISOString();changed=true;}
        const deletedAt=validDate(next.deletedAt); if(deletedAt&&next.deletedAt!==deletedAt.toISOString()){next.deletedAt=deletedAt.toISOString();changed=true;}
        if(next.deleted!==true){next.deleted=true;changed=true;}
        const deletedZone=normalizeTimeZone(next.deletedTimeZone,fallbackZone); if(next.deletedTimeZone!==deletedZone){next.deletedTimeZone=deletedZone;changed=true;}
        const reason=typeof next.deletionReason==='string'&&next.deletionReason.length<=80?next.deletionReason:'user'; if(next.deletionReason!==reason){next.deletionReason=reason;changed=true;}
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
    if (!Array.isArray(rawData.records) || !Array.isArray(rawData.deletedFasts) || !Array.isArray(rawData.weights) || !Array.isArray(rawData.deletedWeights)) throw new Error('missing arrays');
    if (rawData.revision != null && (!Number.isInteger(rawData.revision) || rawData.revision < 0)) throw new Error('invalid revision');
    if (rawData.updatedAt != null && !validDate(rawData.updatedAt)) throw new Error('invalid updated time');
    if (rawData.records.length > MAX_IMPORT_FASTS || rawData.deletedFasts.length > MAX_IMPORT_DELETED_FASTS || rawData.weights.length > MAX_IMPORT_WEIGHTS || rawData.deletedWeights.length > MAX_IMPORT_WEIGHTS) throw new Error('too many records');
    if (!Number.isFinite(parseLocalizedNumber(rawData.goalHours)) || parseLocalizedNumber(rawData.goalHours) <= 0 || parseLocalizedNumber(rawData.goalHours) > MAX_SAFE_GOAL_HOURS) throw new Error('invalid default goal');
    if (!['kg','lb'].includes(rawData.weightUnit)) throw new Error('invalid weight unit');
    if (rawData.language != null && typeof rawData.language !== 'string') throw new Error('invalid language');
    if (!['system','light','dark','grayscale','high-contrast-light','high-contrast-dark','colorblind','protanopia','deuteranopia','tritanopia'].includes(rawData.appearance)) throw new Error('invalid appearance');
    if (rawData.iconChoice != null && !['plate','moon','hourglass','timer','grayscale','highcontrast','colorblind'].includes(rawData.iconChoice)) throw new Error('invalid icon choice');
    if (typeof rawData.gamificationEnabled !== 'boolean') throw new Error('invalid gamification setting');
    const notificationPreferences = rawData.notificationPreferences;
    if (!notificationPreferences || typeof notificationPreferences !== 'object' || Array.isArray(notificationPreferences) ||
        typeof notificationPreferences.enabled !== 'boolean' || typeof notificationPreferences.targetReached !== 'boolean' ||
        typeof notificationPreferences.backupDue !== 'boolean' || typeof notificationPreferences.longFastSafety !== 'boolean' ||
        typeof notificationPreferences.weighIn !== 'boolean' || !['daily','weekly'].includes(notificationPreferences.weighInCadence) ||
        typeof notificationPreferences.cycleComplete !== 'boolean') throw new Error('invalid notification preferences');
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
      if (!Array.isArray(r.editHistory) || r.editHistory.length > MAX_FAST_EDIT_AUDIT || normalizeFastEditHistory(r.editHistory).length !== r.editHistory.length) throw new Error('invalid record edit audit');
      const normalized = normalizeRecord(r);
      if (!normalized) throw new Error('invalid fasting record');
      return normalized;
    });
    if (new Set(records.map(r => r.id)).size !== records.length) throw new Error('duplicate fasting ids');

    const deletedFasts = rawData.deletedFasts.map(r => {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || r.id.length > 120) throw new Error('invalid deleted fast id');
      if (r.deleted !== true) throw new Error('invalid deleted fast marker');
      if (!validDate(r.deletedAt)) throw new Error('invalid deleted fast deletion time');
      if (!isValidTimeZone(r.deletedTimeZone)) throw new Error('invalid deleted fast deletion timezone');
      if (typeof r.deletionReason !== 'string' || !r.deletionReason || r.deletionReason.length > 80) throw new Error('invalid deleted fast reason');
      if (!Number.isFinite(parseLocalizedNumber(r.goalHours)) || parseLocalizedNumber(r.goalHours) <= 0 || parseLocalizedNumber(r.goalHours) > MAX_SAFE_GOAL_HOURS) throw new Error('invalid deleted fast goal');
      if (!isValidTimeZone(r.timeZone)) throw new Error('invalid deleted fast timezone');
      if (r.createdAt != null && !validDate(r.createdAt)) throw new Error('invalid deleted fast creation time');
      if (r.modifiedAt != null && !validDate(r.modifiedAt)) throw new Error('invalid deleted fast modification time');
      if (!Array.isArray(r.editHistory) || r.editHistory.length > MAX_FAST_EDIT_AUDIT || normalizeFastEditHistory(r.editHistory).length !== r.editHistory.length) throw new Error('invalid deleted fast edit audit');
      const normalized = normalizeDeletedFast(r);
      if (!normalized) throw new Error('invalid deleted fasting record');
      return normalized;
    });
    if (new Set(deletedFasts.map(r => r.id)).size !== deletedFasts.length) throw new Error('duplicate deleted fasting ids');
    const liveFastIds = new Set(records.map(r => r.id));
    if (deletedFasts.some(r => liveFastIds.has(r.id))) throw new Error('fast id present in active and deleted history');
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

    const deletedWeights = rawData.deletedWeights.map(w => {
      if (!w || typeof w !== 'object' || typeof w.id !== 'string' || !w.id || w.id.length > 120) throw new Error('invalid deleted weight id');
      if (w.deleted !== true || !validDate(w.deletedAt) || !isValidTimeZone(w.deletedTimeZone)) throw new Error('invalid deleted weight audit');
      if (typeof w.deletionReason !== 'string' || !w.deletionReason || w.deletionReason.length > 80) throw new Error('invalid deleted weight reason');
      if (sanitizeWeightKg(w.kg,null) == null || !isValidTimeZone(w.timeZone)) throw new Error('invalid deleted weight value');
      const normalized = normalizeDeletedWeight(w); if (!normalized) throw new Error('invalid deleted weight record'); return normalized;
    });
    if (new Set(deletedWeights.map(w=>w.id)).size !== deletedWeights.length) throw new Error('duplicate deleted weight ids');
    const liveWeightIds = new Set(weights.map(w=>w.id));
    if (deletedWeights.some(w=>liveWeightIds.has(w.id))) throw new Error('weight id present in active and deleted history');

    const normalized = normalizeData(rawData);
    // Preserve legacy active/history overlap as-is. Recovery mode is for data that
    // cannot be read safely, not for a correctable historical business-rule clash.
    normalized.records = records;
    normalized.deletedFasts = deletedFasts;
    normalized.weights = weights;
    normalized.deletedWeights = deletedWeights;
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

