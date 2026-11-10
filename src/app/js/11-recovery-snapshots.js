// Recovery snapshot retention, coverage, and rolling-snapshot lifecycle.
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
    label: typeof snapshot.label === 'string' ? snapshot.label.trim().slice(0,80) : '',
    dayBucket: typeof snapshot.dayBucket === 'string' ? snapshot.dayBucket : snapshotDayBucket(created),
    weekBucket: typeof snapshot.weekBucket === 'string' ? snapshot.weekBucket : snapshotWeekBucket(created),
    monthBucket: typeof snapshot.monthBucket === 'string' ? snapshot.monthBucket : snapshotMonthBucket(created),
    revision: Math.max(0, Number(snapshot.revision) || 0),
    payloadEncoding: typeof snapshot.payloadEncoding === 'string' ? snapshot.payloadEncoding : null,
    originalBytes: Math.max(0, Number(snapshot.originalBytes) || 0),
    storedBytes: Math.max(0, Number(snapshot.storedBytes) || 0),
    fastingRecords: Math.max(0, Number(snapshot.fastingRecords) || 0),
    deletedFasts: Math.max(0, Number(snapshot.deletedFasts) || 0),
    weightRecords: Math.max(0, Number(snapshot.weightRecords) || 0),
    deletedWeights: Math.max(0, Number(snapshot.deletedWeights) || 0),
    activeFasts: Math.max(0, Number(snapshot.activeFasts) || 0)
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

function snapshotCoverageStats(snapshots = loadSnapshots()) {
  const tiers = {recent:0,daily:0,weekly:0,monthly:0};
  for (const snapshot of snapshots) {
    const keys = snapshotTierKeys(snapshot, snapshots);
    if (keys.includes('backup.tierRecent')) tiers.recent++;
    if (keys.includes('backup.tierDaily')) tiers.daily++;
    if (keys.includes('backup.tierWeekly')) tiers.weekly++;
    if (keys.includes('backup.tierMonthly')) tiers.monthly++;
  }
  const newest = snapshots.length ? snapshots[0].createdAt : null;
  const oldest = snapshots.length ? snapshots[snapshots.length-1].createdAt : null;
  const storedBytes = snapshots.reduce((n,x)=>n+(Number(x.storedBytes)||0),0);
  const originalBytes = snapshots.reduce((n,x)=>n+(Number(x.originalBytes)||0),0);
  return {count:snapshots.length,newest,oldest,storedBytes,originalBytes,...tiers};
}

function humanBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${formatNumber(n,0,0)} B`;
  if (n < 1048576) return `${formatNumber(n/1024,0,1)} KB`;
  return `${formatNumber(n/1048576,0,1)} MB`;
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

async function createInternalSnapshotAsync(reason = 'recovery', sourceAppVersion = APP_VERSION, label = '') {
  if (typeof data === 'undefined' || !data) return null;
  try {
    const now = new Date();
    const meta = {
      id: makeId(), createdAt: now.toISOString(),
      sourceAppVersion: String(sourceAppVersion || 'unknown'), reason: String(reason || 'recovery'), label:String(label||'').trim().slice(0,80),
      dayBucket: snapshotDayBucket(now), weekBucket: snapshotWeekBucket(now), monthBucket: snapshotMonthBucket(now),
      revision: Math.max(0, Number(data.revision) || 0)
    };
    const before = snapshotCache.map(x => x.id);
    // Do not expose a snapshot in the in-memory catalogue until both its
    // metadata and payload have committed successfully. persistSnapshotRecord
    // enriches `meta` with payload size/count information before it returns.
    await persistSnapshotRecord(meta, data);
    snapshotCache = pruneSnapshots([meta, ...snapshotCache]);
    await pruneSnapshotStorage(before);
    setSnapshotProtectionState('ok', snapshotCache.length, snapshotCache.length);
    // During startup/migration the DOM helpers exist, but the rest of the UI
    // bindings have not been initialized yet. Treat a successfully persisted
    // snapshot as success and defer visual refresh until startup completes.
    if (uiReady) {
      renderSnapshotStatus();
      renderBackupStatus();
    }
    return meta;
  } catch (err) {
    console.error('Recovery snapshot persistence failed', err);
    noteDiagnosticError('snapshot.persist');
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

