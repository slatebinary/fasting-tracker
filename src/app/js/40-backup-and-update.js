  function backupDatasetSignature(sourceData = data) {
    const revision = Number(sourceData.revision) || 0;
    if (sourceData === data && backupDatasetSignatureCache &&
        backupDatasetSignatureCache.source === data && backupDatasetSignatureCache.revision === revision)
      return backupDatasetSignatureCache.signature;
    // IndexedDB getAll() returns rows in primary-key order, which may differ
    // from the in-memory array order used when an external backup was created.
    // Dataset identity is order-independent: canonicalize each record collection
    // by stable ID before hashing so a storage reload cannot falsely mark a
    // backup stale merely because its arrays were reordered.
    const byId = list => (Array.isArray(list) ? list : []).slice().sort((a,b) => {
      const left=String(a?.id ?? ''), right=String(b?.id ?? '');
      return left < right ? -1 : left > right ? 1 : 0;
    });
    const tracked = {
      activeStart:sourceData.activeStart || null,
      activeTimeZone:sourceData.activeTimeZone || null,
      activeGoalHours:sourceData.activeGoalHours ?? null,
      activeCreatedAt:sourceData.activeCreatedAt || null,
      activeModifiedAt:sourceData.activeModifiedAt || null,
      records:byId(sourceData.records), deletedFasts:byId(sourceData.deletedFasts),
      weights:byId(sourceData.weights), deletedWeights:byId(sourceData.deletedWeights)
    };
    const signature = 'v1:' + fnv1a64Hex(stableStringify(tracked));
    if (sourceData === data) backupDatasetSignatureCache = {source:data,revision,signature};
    return signature;
  }

  function backupFreshnessState() {
    const hasData = hasBackupWorthyData();
    const last=validDate(backupMeta.lastExternalBackupAt);
    if (!last) return {state:hasData?'never':'empty', changed:hasData, last:null};
    const backedRevision=Math.max(0,Number(backupMeta.lastExternalBackupRevision)||0);
    const updated=validDate(data.updatedAt), backedUpdated=validDate(backupMeta.lastExternalBackupDataUpdatedAt);
    // Pre-v1.12.5 exports have no data-only signature. Retain the previous
    // revision-based behavior for those exports until a new JSON is made.
    const changed=backupMeta.lastExternalBackupDataSignature
      ? backupDatasetSignature() !== backupMeta.lastExternalBackupDataSignature
      : (backedRevision ? Number(data.revision)>backedRevision : (!!updated && updated.getTime()>last.getTime()+1000));
    // A deletion of the FINAL fasting/weight record must still mark the
    // previous export outdated, even though the live dataset is now empty.
    return {state:changed?'stale':hasData?'current':'empty',changed,last,backedRevision,backedUpdated};
  }

  let backupSuccessVisibleUntil = 0;
  let backupSuccessHideTimer = 0;
  function renderFastingBackupIndicator(freshness, due) {
    const row=el('fastingBackupRow'), header=el('fasting')?.querySelector('.fastingSectionHeader');
    const button=el('fastingBackupStatusBtn'), text=el('fastingBackupStatusText');
    if (!row || !header || !button || !text) return;
    const age = freshness.last ? Date.now() - freshness.last.getTime() : 0;
    const state = freshness.state === 'current' && age >= BACKUP_REMINDER_MS ? 'aged' : freshness.state;
    const visible = state === 'stale' || state === 'never' || state === 'aged' ||
      (state === 'current' && Date.now() < backupSuccessVisibleUntil);
    const labelKey = 'backupChip.' + state;
    const descriptionKey = 'backupChip.' + state + 'Help';
    const date = freshness.last ? localDateTimeLabel(freshness.last) : '';
    const status = t(labelKey);
    const explanation = t(descriptionKey, {date});
    button.dataset.state=state;
    const visibleStatus = freshness.last ? `${status} — ${date}` : status;
    if (text.textContent!==visibleStatus) text.textContent=visibleStatus;
    const action=t('backupChip.action');
    button.title = explanation + ' ' + action;
    button.setAttribute('aria-label', status + '. ' + explanation + ' ' + action);
    row.hidden = !visible;
    header.classList.toggle('hasBackupAttention', visible);
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
    const freshnessLabel=el('backupFreshnessLabel');
    if (!label || !banner || !textBox) return;
    const last = validDate(backupMeta.lastExternalBackupAt);
    label.textContent = last ? localDateTimeLabel(last) : t('backup.noneYet');
    const freshness=backupFreshnessState();
    if(freshnessLabel){freshnessLabel.classList.toggle('good',freshness.state==='current');freshnessLabel.classList.toggle('warn',freshness.state==='stale'||freshness.state==='never');freshnessLabel.textContent=freshness.state==='current'?`${t('backup.current')} — ${localDateTimeLabel(freshness.last)}`:freshness.state==='stale'?t('backup.changedSince'):freshness.state==='never'?t('backup.recommended'):t('backup.noData');}
    const due = backupIsDue();
    renderFastingBackupIndicator(freshness, due);
    const snapshotAttention = hasBackupWorthyData() && (snapshotProtectionState.status === 'failed' || snapshotProtectionState.status === 'reduced');
    // The compact fasting backup action already covers aged and missing exports.
    // Preserve the banner only for separate internal-snapshot problems.
    banner.hidden = !snapshotAttention;
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
    const content=el('backupContentSummary');
    if(content) content.textContent=t('backup.contentSummary',{fasts:data.records.length,deletedFasts:data.deletedFasts.length,weights:data.weights.length,deletedWeights:data.deletedWeights.length,snapshots:loadSnapshots().length});
  }

  function renderSnapshotStatus() {
    const status = el('snapshotStatus');
    const btn = el('restoreSnapshotBtn');
    if (!status || !btn) return;
    const snapshots = loadSnapshots(), stats=snapshotCoverageStats(snapshots);
    if (snapshotProtectionState.status === 'failed' && hasBackupWorthyData()) status.textContent = t('backup.snapshotFailedStatus');
    else if (snapshotProtectionState.status === 'reduced' && hasBackupWorthyData()) status.textContent = t('backup.snapshotReducedStatus', {n:snapshots.length});
    else status.textContent = snapshots.length ? t('backup.rollingPolicy', {n:snapshots.length}) : t('backup.snapshotNone');
    const detail=el('snapshotTransparency');
    if(detail) detail.textContent = snapshots.length ? t('backup.snapshotTransparency',{newest:localDateTimeLabel(stats.newest),oldest:localDateTimeLabel(stats.oldest),recent:stats.recent,daily:stats.daily,weekly:stats.weekly,monthly:stats.monthly,size:humanBytes(stats.storedBytes)}) : '';
    btn.disabled = snapshots.length === 0;
  }

  let diagnosticFeedbackTimer = null;
  let diagnosticFeedbackSequence = 0;
  function announceDiagnosticAction(message,state='info') {
    const palette={success:['#17663b','#e8f5ec'],warning:['#805400','#fff4d6'],error:['#9b1c1c','#fdeaea'],info:['#31506d','#edf4fa']};
    const colors=palette[state]||palette.info;
    const sequence=++diagnosticFeedbackSequence;
    if(diagnosticFeedbackTimer!==null)clearTimeout(diagnosticFeedbackTimer);
    for(const id of ['diagnosticActionFeedback','manualSnapshotFeedback']){
      const node=el(id);if(!node)continue;
      node.hidden=false;node.textContent=message;node.dataset.state=state;
      node.setAttribute('role',state==='error'?'alert':'status');
      node.setAttribute('aria-live',state==='error'?'assertive':'polite');
      node.style.borderLeftColor=colors[0];node.style.color=colors[0];node.style.backgroundColor=colors[1];
    }
    const summary=el('deviceCheckSummary');
    if(summary&&!el('deviceCheckModal')?.hidden){summary.hidden=false;summary.textContent=message;summary.dataset.state=state;}
    // Keep feedback long enough to read, then clear it so stale results do not remain on screen.
    diagnosticFeedbackTimer=setTimeout(()=>{
      if(sequence!==diagnosticFeedbackSequence)return;
      for(const id of ['diagnosticActionFeedback','manualSnapshotFeedback']){
        const node=el(id);if(!node)continue;
        node.textContent='';node.hidden=true;node.removeAttribute('data-state');
      }
      const currentSummary=el('deviceCheckSummary');
      if(currentSummary){currentSummary.textContent='';currentSummary.hidden=true;currentSummary.removeAttribute('data-state');}
      diagnosticFeedbackTimer=null;
    },8000);
  }

  async function createManualRecoverySnapshot(label = '') {
    const meta = await createInternalSnapshotAsync('manual recovery point', APP_VERSION, label);
    if (!meta) { alert(t('backup.snapshotFailed')); announceDiagnosticAction(t('actionFeedback.snapshotFailed'),'error'); return false; }
    renderSnapshotStatus(); renderStorageHealth();
    if (!el('snapshotModal')?.hidden) openSnapshotModal();
    announceDiagnosticAction(t('actionFeedback.snapshotCreated'),'success');
    return true;
  }

  function openManualSnapshotModal(){const input=el('manualSnapshotLabel');if(input)input.value='';announceDiagnosticAction(t('actionFeedback.snapshotFormOpened'),'info');showModal('manualSnapshotModal','manualSnapshotLabel');}
  async function saveManualSnapshotFromModal(){const input=el('manualSnapshotLabel'),btn=el('manualSnapshotSaveBtn');if(btn)btn.disabled=true;announceDiagnosticAction(t('actionFeedback.snapshotRunning'),'info');try{if(!(await allowStorageIntensiveOperation())){announceDiagnosticAction(t('actionFeedback.cancelled'),'warning');return;}const ok=await createManualRecoverySnapshot(input?.value||'');if(ok){hideModal('manualSnapshotModal');alert(t('actionFeedback.snapshotCreated'));}}catch(err){noteDiagnosticError('snapshot.manual');announceDiagnosticAction(t('actionFeedback.snapshotFailed'),'error');alert(t('backup.snapshotFailed'));}finally{if(btn)btn.disabled=false;}}

  function markExternalBackupNow(exportedData = data) {
    backupSuccessVisibleUntil = Date.now() + 7000;
    if (backupSuccessHideTimer) clearTimeout(backupSuccessHideTimer);
    backupSuccessHideTimer = setTimeout(() => { backupSuccessHideTimer = 0; renderBackupStatus(); }, 7000);
    backupMeta.lastExternalBackupAt = new Date().toISOString();
    backupMeta.lastExternalBackupRevision = Math.max(0,Number(exportedData.revision)||0);
    backupMeta.lastExternalBackupDataUpdatedAt = validDate(exportedData.updatedAt)?.toISOString() || backupMeta.lastExternalBackupAt;
    backupMeta.lastExternalBackupDataSignature = backupDatasetSignature(exportedData);
    saveBackupMeta();
    renderBackupStatus();
    renderGamification();
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }

  function fnv1a64Hex(text) {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const bytes = new TextEncoder().encode(text);
    for (const byte of bytes) { hash ^= BigInt(byte); hash = BigInt.asUintN(64, hash * prime); }
    return hash.toString(16).padStart(16,'0');
  }

  async function checksumText(text, preferred = 'SHA-256') {
    if (preferred === 'SHA-256' && globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return {algorithm:'SHA-256', digest:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')};
    }
    return {algorithm:'FNV-1a-64', digest:fnv1a64Hex(text)};
  }

  function backupManifest(sourceData = data) {
    return {
      dataVersion: sourceData.dataVersion, databaseSchemaVersion: IDB_VERSION, storageGeneration: STORAGE_GENERATION,
      activeFasts: sourceData.activeStart ? 1 : 0,
      fastingRecords: Array.isArray(sourceData.records) ? sourceData.records.length : 0,
      deletedFasts: Array.isArray(sourceData.deletedFasts) ? sourceData.deletedFasts.length : 0,
      weightRecords: Array.isArray(sourceData.weights) ? sourceData.weights.length : 0,
      deletedWeights: Array.isArray(sourceData.deletedWeights) ? sourceData.deletedWeights.length : 0,
      fastEditAuditEntries: [...(sourceData.records||[]),...(sourceData.deletedFasts||[])].reduce((n,r)=>n+(Array.isArray(r.editHistory)?r.editHistory.length:0),0),
      recoverySnapshotsOnDevice: loadSnapshots().length,
      recoverySnapshotsEmbedded: 0
    };
  }

  function readableBackupView(source) {
    return {
      note: 'For reading only. Restore from the data field using Fasting Tracker Import.',
      summary: {completedFasts:source.records.length, weightMeasurements:source.weights.length, deletedFasts:source.deletedFasts.length, deletedWeights:source.deletedWeights.length, activeFast:!!source.activeStart},
      activeFast:source.activeStart ? {startedLocal:localDateTimeLabel(source.activeStart,source.activeTimeZone), targetHours:source.activeGoalHours} : null,
      completedFasts:source.records.map(r=>({startedLocal:localDateTimeLabel(r.start,r.timeZone),endedLocal:localDateTimeLabel(r.end,r.timeZone),durationHours:Number((recordMs(r)/3600000).toFixed(2)),targetHours:r.goalHours})),
      weights:source.weights.map(w=>({dateLocal:localDateTimeLabel(w.when,w.timeZone),kilograms:w.kg}))
    };
  }

  async function makeBackupPayload() {
    const backupData = JSON.parse(JSON.stringify(data));
    const canonical = stableStringify(backupData);
    const integrity = await checksumText(canonical);
    return {
      format: BACKUP_FORMAT, backupVersion: BACKUP_VERSION, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
      manifest: backupManifest(backupData),
      integrity: {scope:'data', algorithm:integrity.algorithm, digest:integrity.digest},
      readableView: readableBackupView(backupData),
      data: backupData
    };
  }

  function backupManifestMatches(raw) {
    const m=raw?.manifest,d=raw?.data; if(!m||!d)return false;
    const expected={activeFasts:d.activeStart?1:0,fastingRecords:(d.records||[]).length,deletedFasts:(d.deletedFasts||[]).length,weightRecords:(d.weights||[]).length,deletedWeights:(d.deletedWeights||[]).length};
    return Object.entries(expected).every(([k,v])=>Number(m[k])===v);
  }

  async function verifyBackupEnvelope(raw) {
    const version = Number(raw?.backupVersion);
    if (!Number.isInteger(version) || version < BACKUP_MIN_VERSION || version > BACKUP_VERSION) throw new Error('unsupported backup version');
    if (version === 1) return {verified:false, legacy:true};
    if (!raw.integrity || raw.integrity.scope !== 'data' || typeof raw.integrity.digest !== 'string' || !backupManifestMatches(raw)) throw new Error('backup manifest invalid');
    const algorithm = raw.integrity.algorithm === 'FNV-1a-64' ? 'FNV-1a-64' : 'SHA-256';
    const actual = await checksumText(stableStringify(raw.data), algorithm);
    if (actual.algorithm !== algorithm || actual.digest.toLowerCase() !== raw.integrity.digest.toLowerCase()) throw new Error('backup checksum mismatch');
    return {verified:true, legacy:false, algorithm};
  }

  async function exportBackup() {
    const backup = await makeBackupPayload();
    const now = new Date();
    const stamp = `${dayKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${String(now.getMilliseconds()).padStart(3, '0')}`;
    const name = `fasting-backup-${stamp}.json`;
    const json = JSON.stringify(backup, null, 2);
    try {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        markExternalBackupNow(backup.data);
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
      if (confirmed) markExternalBackupNow(backup.data);
      return confirmed;
    } catch {
      alert(t('backup.errCreate'));
      return false;
    }
  }


  function csvCell(value) { const text=String(value??''); return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text; }
  function csvText(headers, rows) { return '\ufeff'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n'); }
  async function shareOrDownloadText(text,name,type='text/csv') {
    const file=new File([text],name,{type});
    try{if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file]});return true;}}catch(err){if(err?.name==='AbortError')return false;}
    const blob=new Blob([text],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return true;
  }
  function csvTimestamp(){const n=new Date();return `${dayKey(n)}-${pad(n.getHours())}${pad(n.getMinutes())}`;}
  async function exportFastingCsv(){
    const headers=['id','start','start_local','end','end_local','duration_hours','target_hours','target_reached','stop_reason','excused_stop','time_zone','created_at','modified_at','edit_count'];
    const rows=sortedRecordsDesc().map(r=>[r.id,r.start,localDateTimeLabel(r.start,r.timeZone),r.end,localDateTimeLabel(r.end,r.timeZone),(recordMs(r)/3600000).toFixed(4),r.goalHours,recordMetGoal(r)?'true':'false',normalizeStopReason(r.stopReason)||'',isExcusedStop(r)?'true':'false',r.timeZone,r.createdAt||'',r.modifiedAt||'',Array.isArray(r.editHistory)?r.editHistory.length:0]);
    await shareOrDownloadText(csvText(headers,rows),`fasting-history-${csvTimestamp()}.csv`);
  }
  async function exportWeightCsv(){
    const headers=['id','when','when_local','weight_kg','time_zone','created_at','modified_at'];
    const rows=sortedWeightsAsc().slice().reverse().map(w=>[w.id,w.when,localDateTimeLabel(w.when,w.timeZone),w.kg,w.timeZone,w.createdAt||'',w.modifiedAt||'']);
    await shareOrDownloadText(csvText(headers,rows),`weight-history-${csvTimestamp()}.csv`);
  }

  async function exportEverything(){
    const backup=await makeBackupPayload(),stamp=csvTimestamp();
    const jsonName=`fasting-backup-${stamp}.json`,fastName=`fasting-history-${stamp}.csv`,weightName=`weight-history-${stamp}.csv`;
    const json=JSON.stringify(backup,null,2);
    const fastHeaders=['id','start','start_local','end','end_local','duration_hours','target_hours','target_reached','stop_reason','excused_stop','time_zone','created_at','modified_at','edit_count'];
    const fastRows=sortedRecordsDesc().map(r=>[r.id,r.start,localDateTimeLabel(r.start,r.timeZone),r.end,localDateTimeLabel(r.end,r.timeZone),(recordMs(r)/3600000).toFixed(4),r.goalHours,recordMetGoal(r)?'true':'false',normalizeStopReason(r.stopReason)||'',isExcusedStop(r)?'true':'false',r.timeZone,r.createdAt||'',r.modifiedAt||'',Array.isArray(r.editHistory)?r.editHistory.length:0]);
    const weightHeaders=['id','when','when_local','weight_kg','time_zone','created_at','modified_at'];
    const weightRows=sortedWeightsAsc().slice().reverse().map(w=>[w.id,w.when,localDateTimeLabel(w.when,w.timeZone),w.kg,w.timeZone,w.createdAt||'',w.modifiedAt||'']);
    const files=[new File([json],jsonName,{type:'application/json'}),new File([csvText(fastHeaders,fastRows)],fastName,{type:'text/csv'}),new File([csvText(weightHeaders,weightRows)],weightName,{type:'text/csv'})];
    try{if(navigator.share&&navigator.canShare?.({files})){await navigator.share({files});markExternalBackupNow(backup.data);return true;}}catch(err){if(err?.name==='AbortError')return false;noteDiagnosticError('export.share');}
    try{const bundle={format:'fasting-tracker-export-bundle',bundleVersion:1,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),backup,files:{fastingCsv:csvText(fastHeaders,fastRows),weightCsv:csvText(weightHeaders,weightRows)}};const name=`fasting-tracker-export-all-${stamp}.json`;await shareOrDownloadText(JSON.stringify(bundle,null,2),name,'application/json');const confirmed=confirm(t('backup.everythingBundleConfirm'));if(confirmed)markExternalBackupNow(backup.data);return confirmed;}catch{noteDiagnosticError('export.bundle');alert(t('backup.errCreate'));return false;}
  }

  function storagePressureFromEstimate(estimate){if(!estimate||!Number.isFinite(estimate.usage)||!Number.isFinite(estimate.quota)||estimate.quota<=0)return {known:false,warning:false,ratio:null,free:null};const ratio=estimate.usage/estimate.quota,free=Math.max(0,estimate.quota-estimate.usage);return {known:true,warning:ratio>=STORAGE_PRESSURE_RATIO||free<STORAGE_PRESSURE_FREE_BYTES,ratio,free};}
  async function allowStorageIntensiveOperation(){try{const est=await navigator.storage?.estimate?.();const pressure=storagePressureFromEstimate(est);if(pressure.warning)return confirm(t('storage.pressureContinue',{percent:formatNumber(pressure.ratio*100,0,0),free:humanBytes(pressure.free)}));}catch{}return true;}
  function installStateCode(){if(isStandaloneApp())return isIOSDevice()?'installed-ios':isAndroidDevice()?'installed-android':'installed-desktop';return isIOSDevice()?'browser-ios':isAndroidDevice()?'browser-android':'browser-desktop';}
  function loadPerformanceMeta(){try{return JSON.parse(localStorage.getItem(PERF_META_KEY)||'null');}catch{return null;}}
  function savePerformanceMeta(value){try{localStorage.setItem(PERF_META_KEY,JSON.stringify(value));}catch{}}
  function renderBenchmarkResult(result){
    const node=el('healthPerformance');if(!node||!result)return;
    node.textContent=t('performance.result',{date:localDateTimeLabel(result.at),total:formatNumber(result.totalMs,0,2),sort:formatNumber(result.sortMs,0,2),totals:formatNumber(result.totalsMs,0,2),serialize:formatNumber(result.serializeMs,0,2),records:result.records,weights:result.weights});
  }
  async function runLocalBenchmark(){
    const btn=el('performanceTestBtn'),status=el('healthPerformance');
    if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true');btn.textContent=t('performance.running');}
    if(status)status.textContent=t('performance.runningStatus');
    announceDiagnosticAction(t('actionFeedback.benchmarkRunning'),'info');
    await new Promise(r=>setTimeout(r,0));
    try{
      const p=globalThis.performance?.now?()=>performance.now():()=>Date.now();
      const t0=p();const rec=[...data.records].sort((a,b)=>String(a.end).localeCompare(String(b.end)));const t1=p();
      buildStoredDayTotals(rec);const t2=p();
      JSON.stringify({records:data.records,weights:data.weights,deletedFasts:data.deletedFasts,deletedWeights:data.deletedWeights});const t3=p();
      const result={at:new Date().toISOString(),records:data.records.length,weights:data.weights.length,sortMs:+(t1-t0).toFixed(2),totalsMs:+(t2-t1).toFixed(2),serializeMs:+(t3-t2).toFixed(2),totalMs:+(t3-t0).toFixed(2)};
      savePerformanceMeta(result);renderBenchmarkResult(result);
      announceDiagnosticAction(t('actionFeedback.benchmarkComplete',{total:formatNumber(result.totalMs,0,2)}),'success');
      // Refresh slower storage/service-worker diagnostics only after the benchmark result is visible.
      setTimeout(()=>{renderStorageHealth().catch(()=>{});},0);
      return result;
    }catch(err){
      noteDiagnosticError('performance.benchmark');if(status)status.textContent=t('performance.failed');announceDiagnosticAction(t('actionFeedback.benchmarkFailed'),'error');return null;
    }finally{
      if(btn){btn.disabled=false;btn.removeAttribute('aria-busy');btn.textContent=t('performance.run');}
    }
  }
  async function queryServiceWorkerHealth(){if(!('serviceWorker'in navigator))return {supported:false};try{const reg=await navigator.serviceWorker.getRegistration();const worker=navigator.serviceWorker.controller||reg?.active;if(!worker)return {supported:true,registered:!!reg,controlled:false};return await new Promise(resolve=>{const ch=new MessageChannel(),timer=setTimeout(()=>resolve({supported:true,registered:true,controlled:!!navigator.serviceWorker.controller,timeout:true}),4000);ch.port1.onmessage=e=>{clearTimeout(timer);resolve({supported:true,registered:true,controlled:!!navigator.serviceWorker.controller,...(e.data||{})});};worker.postMessage({type:'CHECK_HEALTH',protocolVersion:UPDATE_PROTOCOL_VERSION},[ch.port2]);});}catch(err){return {supported:true,error:String(err?.message||err)};}}
  async function repairAppCache(){
    const btn=el('repairCacheBtn');
    if(!confirm(t('cache.repairConfirm'))){announceDiagnosticAction(t('actionFeedback.cancelled'),'warning');return false;}
    if(btn)btn.disabled=true;announceDiagnosticAction(t('actionFeedback.cacheRunning'),'info');
    try{
      const info=await fetchLiveReleaseStatus();
      if(info&&!info.consistency.ok){alert(t('update.deploymentIncomplete'));announceDiagnosticAction(t('actionFeedback.cacheBlocked'),'warning');return false;}
      if(info?.metadataVersion&&compareVersions(info.metadataVersion,APP_VERSION)>0){latestVersion=info.metadataVersion;alert(t('cache.updateInstead',{version:info.metadataVersion}));setUpdateUI('available');announceDiagnosticAction(t('actionFeedback.cacheUpdateRequired',{version:info.metadataVersion}),'warning');return false;}
      await requestShellRefresh(APP_VERSION);lastServiceWorkerHealth=await queryServiceWorkerHealth();await renderStorageHealth();alert(t('cache.repaired'));announceDiagnosticAction(t('cache.repaired'),'success');return true;
    }catch(err){noteDiagnosticError('cache.repair');alert(t('cache.repairFailed'));announceDiagnosticAction(t('cache.repairFailed'),'error');return false;}
    finally{if(btn)btn.disabled=false;}
  }


  function deletedAuditApproxBytes(){try{return new Blob([JSON.stringify({fasts:data.deletedFasts,weights:data.deletedWeights})]).size;}catch{return 0;}}
  function renderDeploymentStatus(){const status=el('healthDeploymentStatus'),versions=el('healthDeploymentVersions');if(!status||!versions)return;status.textContent=deploymentConsistencyState==='ok'?t('deployment.ok'):deploymentConsistencyState==='mismatch'?t('deployment.mismatch'):t('deployment.unknown');versions.textContent=t('deployment.versions',{installed:APP_VERSION,metadata:liveMetadataVersion||'—',entry:liveEntryVersion||'—',worker:lastServiceWorkerHealth?.activeVersion||'—',checked:lastUpdateCheckAt?localDateTimeLabel(lastUpdateCheckAt):t('common.never')});}
  async function runDeviceChecks(){
    const btn=el('deviceChecksBtn');if(btn)btn.disabled=true;announceDiagnosticAction(t('actionFeedback.deviceChecksRunning'),'info');
    const checks=[];const add=(key,ok,detail='')=>checks.push({key,ok,detail});
    try{
      try{const key='device-check';await idbPut('state',{key,data:{at:new Date().toISOString()}});const row=await idbGet('state',key);await idbDelete('state',key);add('indexeddb',!!row);}catch(e){add('indexeddb',false);noteDiagnosticError('device.indexeddb');}
      try{const persistent=await navigator.storage?.persisted?.();add('storage',persistent===true,persistent===true?'persistent':persistent===false?'not-persistent':'unknown');}catch{add('storage',false,'unavailable');}
      try{const sw=await queryServiceWorkerHealth();add('serviceworker',!!(sw?.supported&&sw?.controlled&&sw?.cacheComplete!==false),sw?.activeVersion||'');}catch{add('serviceworker',false);}
      try{const caps=FTPlatform.shareCapabilities();add('files',caps.fileShare||caps.downloads,caps.fileShare?'file-share':caps.downloads?'download':'unsupported');}catch{add('files',false,'unavailable');}
      add('notifications','Notification'in window,notificationPermissionState());add('standalone',isStandaloneApp(),installStateCode());
      const keyMap={indexeddb:'deviceChecks.indexeddb',storage:'deviceChecks.storage',serviceworker:'deviceChecks.serviceworker',files:'deviceChecks.files',notifications:'deviceChecks.notifications',standalone:'deviceChecks.standalone'};
      const list=el('deviceCheckList');list.replaceChildren();for(const c of checks){const li=document.createElement('li');li.textContent=`${c.ok?'✓':'⚠'} ${t(keyMap[c.key]||'deviceChecks.title')}${c.detail?` — ${c.detail}`:''}`;list.append(li);}
      const passed=checks.filter(c=>c.ok).length,warning=checks.length-passed;
      const summary=t('actionFeedback.deviceChecksComplete',{passed,total:checks.length,warning});announceDiagnosticAction(summary,warning?'warning':'success');
      const summaryNode=el('deviceCheckSummary');if(summaryNode)summaryNode.textContent=summary;
      showModal('deviceCheckModal','deviceCheckCloseBtn');return checks;
    }catch(err){
      noteDiagnosticError('device.checks');announceDiagnosticAction(t('actionFeedback.deviceChecksFailed'),'error');
      const summary=el('deviceCheckSummary');if(summary)summary.textContent=t('actionFeedback.deviceChecksFailed');
      showModal('deviceCheckModal','deviceCheckCloseBtn');return checks;
    }finally{if(btn)btn.disabled=false;}
  }
  async function emptyRecentlyDeleted(){
    const total=data.deletedFasts.length+data.deletedWeights.length;if(!total){alert(t('deleted.none'));return false;}
    if(!confirm(t('deleted.emptyConfirm',{n:total,size:humanBytes(deletedAuditApproxBytes())})))return false;
    if(backupFreshnessState().state!=='current'&&confirm(t('deleted.backupFirst'))){const ok=await exportBackup();if(!ok)return false;}
    const oldF=data.deletedFasts.slice(),oldW=data.deletedWeights.slice();data.deletedFasts=[];data.deletedWeights=[];if(!save({invalidateDerived:false,dirtyViews:['history','weight','settings']})){data.deletedFasts=oldF;data.deletedWeights=oldW;renderAll();return false;}renderAll();return true;
  }
  async function rebuildDerivedData(){
    const btn=el('rebuildDerivedBtn');if(btn)btn.disabled=true;announceDiagnosticAction(t('actionFeedback.recalculateRunning'),'info');
    try{
      storedDayTotalsMap=buildStoredDayTotals(data.records);dayTotalsRecordMap=recordMap(data.records);await persistDailyTotals(data.revision);invalidateDerivedCaches();markViewsDirty();renderAll();
      const issues=await collectIntegrityIssues();lastIntegrityCheck={ok:issues.length===0,issues,at:new Date().toISOString()};
      if(lastIntegrityCheck.ok){markLastKnownGood('rebuild-derived');alert(t('derived.rebuilt'));announceDiagnosticAction(t('derived.rebuilt'),'success');return true;}
      alert(t('derived.failed'));announceDiagnosticAction(t('actionFeedback.recalculateWarning',{n:issues.length}),'warning');return false;
    }catch(err){noteDiagnosticError('derived.rebuild');alert(t('derived.failed'));announceDiagnosticAction(t('actionFeedback.recalculateFailed'),'error');return false;}
    finally{if(btn)btn.disabled=false;}
  }

  async function renderStorageHealth() {
    const rc=el('healthRecordCount'); if(!rc)return;
    rc.textContent=formatNumber(data.records.length+data.weights.length);
    el('healthDeletedCount').textContent=formatNumber(data.deletedFasts.length+data.deletedWeights.length);
    el('healthSnapshotCount').textContent=formatNumber(loadSnapshots().length);
    const last=validDate(backupMeta.lastExternalBackupAt); el('healthBackupAge').textContent=last?localDateLabel(last):t('common.never');
    let persisted=null; try{if(navigator.storage?.persisted)persisted=await navigator.storage.persisted();}catch{}
    el('healthPersistence').textContent=t('storage.healthPersistence',{status:persisted===true?t('storage.healthProtected'):persisted===false?t('storage.healthNotProtected'):t('storage.healthUnavailable')});
    let usageText=t('storage.usageUnknown'),estimate=null;try{estimate=await navigator.storage?.estimate?.()||null;if(estimate&&Number.isFinite(estimate.usage)&&Number.isFinite(estimate.quota)){const mb=n=>formatNumber(n/1048576,0,1);usageText=t('storage.healthUsage',{used:mb(estimate.usage),quota:mb(estimate.quota)});}}catch{}
    el('healthUsage').textContent=usageText;
    const good=lastKnownGoodMeta(),goodNode=el('healthLastKnownGood');if(goodNode)goodNode.textContent=good?t('deployment.lastKnownGood',{version:good.version,date:localDateTimeLabel(good.at)}):t('deployment.lastKnownGoodNone');const hist=deploymentHistoryMeta(),histNode=el('deploymentHistoryList');if(histNode){histNode.replaceChildren();if(!hist.length)histNode.textContent=t('deployment.historyNone');else{const ul=document.createElement('ul');ul.style.margin='6px 0 0';for(const item of hist.slice().reverse()){const li=document.createElement('li');li.textContent=t('deployment.historyItem',{type:t(`deployment.event.${item.type}`),version:item.version,date:localDateTimeLabel(item.at),detail:item.detail?` • ${item.detail}`:''});ul.append(li);}histNode.append(ul);}}const pressure=storagePressureFromEstimate(estimate),pressureNode=el('storagePressureWarning');if(pressureNode){pressureNode.classList.toggle('warn',pressure.warning);pressureNode.textContent=!pressure.known?t('storage.pressureUnknown'):pressure.warning?t('storage.pressureWarning',{percent:formatNumber(pressure.ratio*100,0,0),free:humanBytes(pressure.free)}):t('storage.pressureOk',{percent:formatNumber(pressure.ratio*100,0,0),free:humanBytes(pressure.free)});}
    el('healthLastSave').textContent=t('storage.healthLastSave',{date:lastSuccessfulIdbSaveAt?localDateTimeLabel(lastSuccessfulIdbSaveAt):t('common.never')});
    const prot=snapshotProtectionState.status==='ok'?t('storage.healthGood'):snapshotProtectionState.status==='reduced'?t('storage.healthReduced'):t('storage.healthNeedsAttention');
    el('healthProtection').textContent=t('storage.healthRecovery',{status:prot});
    const ss=snapshotCoverageStats();
    el('healthSnapshotDetail').textContent=ss.count?t('storage.healthSnapshotDetail',{newest:localDateTimeLabel(ss.newest),oldest:localDateTimeLabel(ss.oldest),size:humanBytes(ss.storedBytes),recent:ss.recent,daily:ss.daily,weekly:ss.weekly,monthly:ss.monthly}):t('storage.healthSnapshotNone');
    const migration=migrationStatusMeta();
    el('healthMigrationStatus').textContent=migration.pending?t('storage.healthMigrationPending',{from:migration.pending.from,to:migration.pending.to}):migration.last?.status==='success'?t('storage.healthMigrationSuccess',{from:migration.last.from,to:migration.last.to,date:localDateTimeLabel(migration.last.completedAt)}):migration.last?.status==='failed'?t('storage.healthMigrationFailed',{from:migration.last.from,to:migration.last.to,date:localDateTimeLabel(migration.last.completedAt)}):t('storage.healthMigrationNone');
    const install=installStateCode();el('healthInstallState').textContent=t(`installState.${install}`);lastServiceWorkerHealth=await queryServiceWorkerHealth();const sw=lastServiceWorkerHealth;el('healthServiceWorker').textContent=!sw?.supported?t('cache.unsupported'):sw.error||sw.timeout?t('cache.unavailable'):sw.cacheComplete===false?t('cache.incomplete',{n:sw.missingAssets||0}):sw.activeVersion?t('cache.healthy',{version:sw.activeVersion}):t('cache.notControlled');renderDeploymentStatus();el('healthDeletedStorage').textContent=t('deleted.storage',{n:data.deletedFasts.length+data.deletedWeights.length,size:humanBytes(deletedAuditApproxBytes())});const perf=loadPerformanceMeta();if(perf)renderBenchmarkResult(perf);else el('healthPerformance').textContent=t('performance.none');
    el('healthIntegrityStatus').textContent=lastIntegrityCheck?(lastIntegrityCheck.ok?t('integrity.lastOk',{date:localDateTimeLabel(lastIntegrityCheck.at)}):t('integrity.lastIssues',{n:lastIntegrityCheck.issues.length,date:localDateTimeLabel(lastIntegrityCheck.at)})):t('integrity.notChecked');
  }

  function addIntegrityIssue(issues, code, detail='') { const text=String(detail||''); issues.push({code,detail:code==='daily-totals-mismatch'?text:text.slice(0,160)}); }

  function mapsApproximatelyEqual(a,b,tolerance=2) {
    const keys=new Set([...a.keys(),...b.keys()]);
    for(const key of keys) if(Math.abs((a.get(key)||0)-(b.get(key)||0))>tolerance) return false;
    return true;
  }

  function describeDailyTotalsMismatch(recalculated,cached,tolerance=2) {
    const keys=[...new Set([...recalculated.keys(),...cached.keys()])]
      .filter(key=>Math.abs((recalculated.get(key)||0)-(cached.get(key)||0))>tolerance)
      .sort();
    if(!keys.length)return '';
    const details=keys.map(key=>{
      const recordMs=recalculated.get(key)||0;
      const cachedMs=cached.get(key)||0;
      const expected=(recordMs/3600000).toFixed(5);
      const found=(cachedMs/3600000).toFixed(5);
      const deltaSeconds=((cachedMs-recordMs)/1000).toFixed(3);
      return `${key}: records ${expected}h, cached ${found}h (cached − records: ${deltaSeconds}s)`;
    });
    return `Dates (${keys.length}): ${details.join('; ')}`;
  }

  async function collectStartupIntegrityIssues() {
    // Keep automatic startup validation deliberately lightweight. Full integrity
    // verification can rebuild daily totals and decode every recovery snapshot,
    // which is appropriate when the user requests it but would block the UI on
    // decades of history. Startup only verifies the authoritative primary shape,
    // basic record chronology/identity, and the persisted primary revision.
    const issues=[];
    if(!data || data.dataVersion!==DATA_VERSION || !Array.isArray(data.records) || !Array.isArray(data.weights) || !Array.isArray(data.deletedFasts) || !Array.isArray(data.deletedWeights)) {
      addIntegrityIssue(issues,'primary-structure'); return issues;
    }
    const ids=new Set();
    for(const r of data.records){
      if(!r || typeof r.id!=='string' || !r.id || ids.has(r.id)){addIntegrityIssue(issues,'duplicate-fast-id');break;}
      ids.add(r.id); const a=Date.parse(r.start),b=Date.parse(r.end); if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a){addIntegrityIssue(issues,'primary-structure');break;}
    }
    if(!issues.length){
      try{const storedSnapshot=await loadRecordBasedSnapshot();const stored=storedSnapshot?.data||null;if(!stored)addIntegrityIssue(issues,'primary-store-missing');else if(Number(stored.revision)!==Number(data.revision))addIntegrityIssue(issues,'revision-mismatch');}
      catch(err){addIntegrityIssue(issues,'primary-store-read',err?.message);}
    }
    return issues;
  }

  async function collectIntegrityIssues() {
    const issues=[];
    try { validateCompatibleData(JSON.parse(JSON.stringify(data))); } catch(err) { addIntegrityIssue(issues,'primary-structure',err?.message); }
    const liveIds=new Set(), deletedIds=new Set(), weightIds=new Set(), deletedWeightIds=new Set();
    for(const r of data.records){if(liveIds.has(r.id))addIntegrityIssue(issues,'duplicate-fast-id');liveIds.add(r.id);if(normalizeFastEditHistory(r.editHistory).length!==(r.editHistory||[]).length)addIntegrityIssue(issues,'invalid-edit-audit');}
    for(const r of data.deletedFasts){if(deletedIds.has(r.id))addIntegrityIssue(issues,'duplicate-deleted-fast-id');deletedIds.add(r.id);if(liveIds.has(r.id))addIntegrityIssue(issues,'fast-live-deleted-conflict');if(normalizeFastEditHistory(r.editHistory).length!==(r.editHistory||[]).length)addIntegrityIssue(issues,'invalid-edit-audit');}
    for(const w of data.weights){if(weightIds.has(w.id))addIntegrityIssue(issues,'duplicate-weight-id');weightIds.add(w.id);}
    for(const w of data.deletedWeights){if(deletedWeightIds.has(w.id))addIntegrityIssue(issues,'duplicate-deleted-weight-id');deletedWeightIds.add(w.id);if(weightIds.has(w.id))addIntegrityIssue(issues,'weight-live-deleted-conflict');}
    const sorted=[...data.records].sort((a,b)=>String(a.start).localeCompare(String(b.start)));
    for(let i=1;i<sorted.length;i++){if(new Date(sorted[i].start)<new Date(sorted[i-1].end)){addIntegrityIssue(issues,'overlapping-fasts');break;}}
    if(data.activeStart){const a=new Date(data.activeStart).getTime();if(sorted.some(r=>a<new Date(r.end).getTime()&&Date.now()>new Date(r.start).getTime()))addIntegrityIssue(issues,'active-fast-overlap');}
    const recalculated=buildStoredDayTotals(data.records); if(!mapsApproximatelyEqual(recalculated,storedDayTotalsMap))addIntegrityIssue(issues,'daily-totals-mismatch',describeDailyTotalsMismatch(recalculated,storedDayTotalsMap));
    try {
      const [metas,payloads]=await Promise.all([idbGetAll('snapshotMeta'),idbGetAll('snapshotPayload')]);
      const metaIds=new Set(metas.map(x=>x.id)),payloadIds=new Set(payloads.map(x=>x.id));
      if(metas.some(x=>!payloadIds.has(x.id)))addIntegrityIssue(issues,'snapshot-payload-missing');
      if(payloads.some(x=>!metaIds.has(x.id)))addIntegrityIssue(issues,'snapshot-meta-missing');
      for(const row of payloads){
        try{const payload=await decodeSnapshotPayload(row);if(!payload)throw new Error('unreadable');validateCompatibleData(payload);}catch{addIntegrityIssue(issues,'snapshot-corrupt');break;}
      }
    } catch(err){addIntegrityIssue(issues,'snapshot-store-read',err?.message);}
    try {
      const storedSnapshot=await loadRecordBasedSnapshot();const stored=storedSnapshot?.data||null;
      if(!stored)addIntegrityIssue(issues,'primary-store-missing');
      else if(Number(stored.revision)!==Number(data.revision))addIntegrityIssue(issues,'revision-mismatch');
    } catch(err){addIntegrityIssue(issues,'primary-store-read',err?.message);}
    return issues;
  }

  function integrityIssueLabel(issue) {
    const key=`integrity.issue.${issue.code}`; const translated=t(key);
    return translated===key ? issue.code : translated;
  }

  async function runDataIntegrityCheck() {
    const btn=el('integrityCheckBtn'); if(btn)btn.disabled=true;
    announceDiagnosticAction(t('actionFeedback.integrityRunning'),'info');
    try {
    const issues=await collectIntegrityIssues();
    lastIntegrityCheck={ok:issues.length===0,issues,at:new Date().toISOString()};if(lastIntegrityCheck.ok)markLastKnownGood('integrity-check');
    const summary=el('integritySummary'),list=el('integrityIssueList'); list.replaceChildren();
    summary.textContent=issues.length?t('integrity.issuesFound',{n:issues.length}):t('integrity.ok');
    el('integrityCopyStatus').textContent='';
    if(!issues.length){const li=document.createElement('li');li.textContent=t('integrity.noProblems');list.append(li);}
    else for(const issue of issues){const li=document.createElement('li');li.textContent=integrityIssueLabel(issue)+(issue.detail?' — '+issue.detail:'');list.append(li);}
    announceDiagnosticAction(issues.length?t('integrity.issuesFound',{n:issues.length}):t('integrity.ok'),issues.length?'warning':'success');
    if(btn)btn.disabled=false; await renderStorageHealth(); showModal('integrityModal','integrityCloseBtn');
    return lastIntegrityCheck;
    } catch(err) {
      noteDiagnosticError('integrity.check');
      announceDiagnosticAction(t('actionFeedback.integrityFailed'),'error');
      const summary=el('integritySummary'),list=el('integrityIssueList');
      if(summary)summary.textContent=t('actionFeedback.integrityFailed');
      if(list){list.replaceChildren();const li=document.createElement('li');li.textContent=t('actionFeedback.noDataChanged');list.append(li);}
      showModal('integrityModal','integrityCloseBtn');
      return null;
    } finally { if(btn)btn.disabled=false; }
  }

  async function copyIntegrityReport(){
    const status=el('integrityCopyStatus');
    const report=[t('integrity.title'),lastIntegrityCheck?.ok?t('integrity.ok'):t('integrity.issuesFound',{n:lastIntegrityCheck?.issues?.length||0})];
    for(const issue of (lastIntegrityCheck?.issues||[])) report.push(integrityIssueLabel(issue)+(issue.detail?' — '+issue.detail:''));
    const text=report.join('\n');
    let copied=false;
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);copied=true;}}catch{}
    if(!copied){
      let area=null;
      try{area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.focus();area.select();copied=!!document.execCommand('copy');}
      catch{}finally{area?.remove();}
    }
    status.textContent=copied?t('integrity.copied'):t('integrity.copyFailed');
  }

  async function exportDiagnostics(){
    let estimate=null,persistent=null; try{estimate=await navigator.storage?.estimate?.()||null;}catch{} try{persistent=await navigator.storage?.persisted?.()??null;}catch{}
    let swInfo=null; try{const reg=await navigator.serviceWorker?.getRegistration?.();swInfo=reg?{scope:reg.scope,active:!!reg.active,waiting:!!reg.waiting,installing:!!reg.installing}:null;}catch{}
    const ss=snapshotCoverageStats(),migration=migrationStatusMeta();
    const payload={
      format:'fasting-tracker-diagnostics', appVersion:APP_VERSION, updateProtocolVersion:UPDATE_PROTOCOL_VERSION, exportedAt:new Date().toISOString(),
      environment:{userAgent:navigator.userAgent||'',language:navigator.language||'',standalone:isStandaloneApp(),installState:installStateCode(),online:navigator.onLine!==false,notificationPermission:notificationPermissionState(),notificationState:notificationDiagnosticState(),persistentStorage:persistent,storageEstimate:estimate?{usage:estimate.usage,quota:estimate.quota}:null,storagePressure:storagePressureFromEstimate(estimate),serviceWorker:swInfo,serviceWorkerHealth:lastServiceWorkerHealth,deployment:{state:deploymentConsistencyState,metadataVersion:liveMetadataVersion,entryVersion:liveEntryVersion,lastCheckedAt:lastUpdateCheckAt}},
      database:{schemaVersion:IDB_VERSION,dataVersion:DATA_VERSION,storageGeneration:STORAGE_GENERATION,minimumDirectStorageGeneration:MIN_DIRECT_STORAGE_GENERATION,supportedBackupVersions:[BACKUP_MIN_VERSION,BACKUP_VERSION],lastSuccessfulSaveAt:lastSuccessfulIdbSaveAt,revision:data.revision,activeFasts:data.activeStart?1:0,fastingRecords:data.records.length,excusedStops:data.records.filter(isExcusedStop).length,fastEditAuditEntries:[...data.records,...data.deletedFasts].reduce((n,r)=>n+(Array.isArray(r.editHistory)?r.editHistory.length:0),0),deletedFastAuditRecords:data.deletedFasts.length,weightRecords:data.weights.length,deletedWeightAuditRecords:data.deletedWeights.length,recoverySnapshots:ss.count,recoverySnapshotStoredBytes:ss.storedBytes,snapshotProtection:snapshotProtectionState.status,lastExternalBackupAt:backupMeta.lastExternalBackupAt||null,backupFreshness:backupFreshnessState().state,lastExternalBackupRevision:backupMeta.lastExternalBackupRevision||0},
      migration:{pending:migration.pending?{from:migration.pending.from,to:migration.pending.to,startedAt:migration.pending.startedAt}:null,last:migration.last?{from:migration.last.from,to:migration.last.to,status:migration.last.status,reason:migration.last.reason||null,error:migration.last.error||null,completedAt:migration.last.completedAt}:null,storage:readAppMeta().lastStorageMigration||null},
      integrity:lastIntegrityCheck?{ok:lastIntegrityCheck.ok,checkedAt:lastIntegrityCheck.at,issueCodes:lastIntegrityCheck.issues.map(x=>x.code),issueDetails:lastIntegrityCheck.issues.map(x=>({code:x.code,detail:x.detail||''}))}:null,
      recoveryMode:recoveryMode?String(recoveryMode.reason||recoveryMode):null,
      performance:loadPerformanceMeta(),
      recentErrorCodes:diagnosticErrors.slice(-20)
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`fasting-tracker-diagnostics-${dayKey(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function selectedIconInstallUrl() {
    const u = new URL(location.href);
    u.search = ''; u.hash = '';
    u.searchParams.set('icon', normalizeIconChoice(data.iconChoice));
    const pref = normalizeLanguage(data.language);
    if (pref !== 'system') u.searchParams.set('lang', pref);
    return u.toString();
  }

  function shareInstallUrl() {
    return selectedIconInstallUrl();
  }


  function buildShareProgressLines() {
    const lines = ['Fasting Tracker'];
    const includeFast = !!el('shareFastToggle')?.checked;
    const includeStats = !!el('shareStatsToggle')?.checked;
    const includeConsistency = !!el('shareConsistencyToggle')?.checked && data.gamificationEnabled !== false;
    const includeWeight = !!el('shareWeightToggle')?.checked;

    if (includeFast) {
      if (data.activeStart) {
        const start = validDate(data.activeStart);
        const elapsed = start ? Math.max(0, Date.now() - start.getTime()) : 0;
        const target = sanitizeGoal(data.activeGoalHours ?? data.goalHours, data.goalHours);
        lines.push(t('share.activeFastLine', {duration:compactDuration(elapsed), target:`${formatNumber(target,0,3)}${t('unit.h')}`}));
      } else {
        const latest = latestCompletedFast();
        if (latest) {
          const duration = recordMs(latest);
          const target = sanitizeGoal(latest.goalHours, data.goalHours);
          lines.push(t('share.latestFastLine', {
            duration:compactDuration(duration),
            target:`${formatNumber(target,0,3)}${t('unit.h')}`,
            result:t(recordMetGoal(latest) ? 'share.targetReached' : isExcusedStop(latest) ? 'share.targetNotReachedExcused' : 'share.targetNotReached'),
            date:localDateLabel(latest.end, latest.timeZone)
          }));
        }
      }
    }

    if (includeStats && data.records.length) {
      const summary = statsSummary();
      lines.push(t('share.statsLine', {
        count:formatNumber(summary.count),
        average:compactDuration(summary.average),
        total:compactDuration(summary.total),
        streak:formatNumber(summary.streak)
      }));
    }

    if (includeConsistency) {
      const {xp, level} = gamificationSummaryModel();
      lines.push(t('share.consistencyLine', {xp:formatNumber(xp), level:formatNumber(level.number), name:t(level.nameKey)}));
    }

    if (includeWeight && data.weights.length) {
      const asc = sortedWeightsAsc();
      const first = asc[0], latest = asc[asc.length - 1];
      lines.push(t('share.weightLine', {
        weight:formatWeight(latest.kg),
        change:formatWeight(latest.kg - first.kg, data.weightUnit, true),
        date:localDateLabel(latest.when, latest.timeZone)
      }));
    }

    if (lines.length === 1) lines.push(t('share.appOnlyLine'));
    return lines;
  }

  function buildShareProgressPayload() {
    const url = shareInstallUrl();
    const body = buildShareProgressLines().join('\n');
    return {
      title: t('share.shareTitle'),
      body,
      copyText: `${body}\n\n${t('share.installLine', {url})}`,
      url
    };
  }

  function renderSharePreview() {
    const preview = el('sharePreview');
    const link = el('shareInstallLink');
    if (!preview || !link) return;
    const lines = buildShareProgressLines();
    preview.textContent = lines.join('\n');
    link.textContent = t('share.installIncluded', {url:shareInstallUrl()});
    const consistencyOption = el('shareConsistencyOption');
    if (consistencyOption) consistencyOption.hidden = data.gamificationEnabled === false;
  }

  function openShareModal() {
    el('shareStatus').textContent = '';
    const consistencyToggle = el('shareConsistencyToggle');
    if (consistencyToggle) consistencyToggle.checked = data.gamificationEnabled !== false;
    renderSharePreview();
    showModal('shareModal', 'shareNativeBtn');
  }

  function closeShareModal() {
    hideModal('shareModal');
  }

  async function copyShareProgress() {
    const status = el('shareStatus');
    const payload = buildShareProgressPayload();
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload.copyText);
        copied = true;
      }
    } catch {}
    if (!copied) {
      try {
        const area = document.createElement('textarea');
        area.value = payload.copyText;
        area.setAttribute('readonly','');
        area.style.position = 'fixed'; area.style.opacity = '0';
        document.body.append(area); area.select();
        copied = !!document.execCommand?.('copy'); area.remove();
      } catch {}
    }
    if (status) status.textContent = copied ? t('share.copied') : t('share.copyFailed');
    return copied;
  }

  async function shareProgress() {
    const status = el('shareStatus');
    const payload = buildShareProgressPayload();
    if (navigator.share) {
      try {
        await navigator.share({title:payload.title, text:payload.body, url:payload.url});
        if (status) status.textContent = t('share.shared');
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    const copied = await copyShareProgress();
    if (copied && status) status.textContent = t('share.shareUnavailableCopied');
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
    return [...document.querySelectorAll('.modalBackdrop')].reverse().find(modal => !modal.hidden) || null;
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
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalFocusStack.push({ id, restore });
    modal.hidden = false;
    document.body.classList.add('modalOpen');
    setBackgroundInert(true);
    setTimeout(() => {
      let target = (focusId ? el(focusId) : null) || modal.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
      if (target?.matches(':disabled')) target = null;
      if (!target) {
        target = modal.querySelector('[role="dialog"], [role="alertdialog"]');
        if (target && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      }
      target?.focus();
    }, 0);
  }

  function hideModal(id) {
    const modal = el(id);
    if (modal) modal.hidden = true;
    let restore = null;
    for (let i = modalFocusStack.length - 1; i >= 0; i--) {
      if (modalFocusStack[i].id === id) {
        restore = modalFocusStack[i].restore;
        modalFocusStack.splice(i, 1);
        break;
      }
    }
    const nextModal = visibleModal();
    if (!nextModal) {
      document.body.classList.remove('modalOpen');
      setBackgroundInert(false);
      if (recoveryMode) applyRecoveryMode();
      modalFocusStack.length = 0;
    }
    if (restore && document.contains(restore) && !restore.closest('[hidden]') && (!nextModal || nextModal.contains(restore))) {
      setTimeout(() => restore.focus(), 0);
    }
  }

  function closeSnapshotModal() {
    hideModal('snapshotModal');
  }

  async function performSnapshotRestore(snapshotId) {
    const selected = loadSnapshots().find(s => s.id === snapshotId);
    if (!selected) { alert(t('backup.snapshotUnavailable')); return; }
    try {
      const payload = await loadSnapshotPayload(snapshotId);
      if (!payload) { alert(t('backup.snapshotUnavailable')); return; }
      const restored = validateCompatibleData(payload).data;
      if (!recoveryMode) {
        const safety = await createInternalSnapshotAsync('before restoring another snapshot');
        if (!safety) { alert(t('backup.snapshotFailed')); return; }
      }
      if (!await persistResolvedDataAtomic(restored)) return;
      pendingSnapshotRestoreId=null; hideModal('snapshotPreviewModal'); closeSnapshotModal(); renderAll(); alert(t('backup.snapshotRestored'));
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
    if (text === 'manual recovery point') return t('backup.manualReason');
    return text || '—';
  }

  async function snapshotPayloadSummary(snapshot) {
    let payload=null; try{payload=await loadSnapshotPayload(snapshot.id);}catch{}
    if(!payload)return null;
    const summary={fasts:(payload.records||[]).length,deletedFasts:(payload.deletedFasts||[]).length,weights:(payload.weights||[]).length,deletedWeights:(payload.deletedWeights||[]).length,active:payload.activeStart?1:0};
    if(!snapshot.payloadEncoding||!snapshot.originalBytes){Object.assign(snapshot,{fastingRecords:summary.fasts,deletedFasts:summary.deletedFasts,weightRecords:summary.weights,deletedWeights:summary.deletedWeights,activeFasts:summary.active});try{await idbPut('snapshotMeta',snapshot);}catch{}}
    return summary;
  }

  function objectMapById(items){return new Map((Array.isArray(items)?items:[]).map(x=>[x.id,x]));}
  function diffById(current,target){const a=objectMapById(current),b=objectMapById(target);let added=0,removed=0,changed=0;for(const [id,v] of b){if(!a.has(id))added++;else if(stableStringify(a.get(id))!==stableStringify(v))changed++;}for(const id of a.keys())if(!b.has(id))removed++;return {added,removed,changed};}
  function snapshotRestoreDiff(payload){const fast=diffById(data.records,payload.records),weights=diffById(data.weights,payload.weights),deletedFasts=diffById(data.deletedFasts,payload.deletedFasts),deletedWeights=diffById(data.deletedWeights,payload.deletedWeights);const ignored=new Set(['records','deletedFasts','weights','deletedWeights','revision','updatedAt']);const keys=new Set([...Object.keys(data),...Object.keys(payload)]);let settingsChanged=0;for(const k of keys)if(!ignored.has(k)&&stableStringify(data[k])!==stableStringify(payload[k]))settingsChanged++;return {fast,weights,deletedFasts,deletedWeights,settingsChanged};}

  async function openSnapshotPreview(snapshotId) {
    const snapshot=loadSnapshots().find(s=>s.id===snapshotId); if(!snapshot){alert(t('backup.snapshotUnavailable'));return;}
    const summary=await snapshotPayloadSummary(snapshot); if(!summary){alert(t('backup.snapshotUnavailable'));return;}
    const payload=await loadSnapshotPayload(snapshot.id);if(!payload){alert(t('backup.snapshotUnavailable'));return;}const diff=snapshotRestoreDiff(payload);
    pendingSnapshotRestoreId=snapshotId;
    el('snapshotPreviewDate').textContent=t('backup.previewDate',{date:localDateTimeLabel(snapshot.createdAt),version:snapshot.sourceAppVersion||'—'});
    el('snapshotPreviewReason').textContent=t('backup.previewReason',{reason:snapshotReasonLabel(snapshot.reason)});
    el('snapshotPreviewLabel').textContent=snapshot.label?t('backup.previewLabel',{label:snapshot.label}):t('backup.previewNoLabel');
    el('snapshotPreviewCounts').textContent=t('backup.previewCounts',{fasts:summary.fasts,deletedFasts:summary.deletedFasts,weights:summary.weights,deletedWeights:summary.deletedWeights,active:summary.active});
    el('snapshotPreviewSize').textContent=t('backup.previewSize',{size:humanBytes(snapshot.storedBytes||0)});
    el('snapshotPreviewComparison').textContent=t('backup.previewComparison',{fastAdd:diff.fast.added,fastRemove:diff.fast.removed,fastChange:diff.fast.changed,weightAdd:diff.weights.added,weightRemove:diff.weights.removed,weightChange:diff.weights.changed,deletedFastChange:diff.deletedFasts.added+diff.deletedFasts.removed+diff.deletedFasts.changed,deletedWeightChange:diff.deletedWeights.added+diff.deletedWeights.removed+diff.deletedWeights.changed,settings:diff.settingsChanged});
    showModal('snapshotPreviewModal','snapshotPreviewCancelBtn');
  }

  function renderSnapshotModalSummary() {
    const box=el('snapshotModalSummary'); if(!box)return; box.replaceChildren(); const st=snapshotCoverageStats();
    const rows=st.count?[
      t('backup.modalNewest',{date:localDateTimeLabel(st.newest)}),t('backup.modalOldest',{date:localDateTimeLabel(st.oldest)}),
      t('backup.modalCoverage',{recent:st.recent,daily:st.daily,weekly:st.weekly,monthly:st.monthly}),t('backup.modalStorage',{size:humanBytes(st.storedBytes)})
    ]:[t('backup.snapshotEmpty')];
    for(const text of rows){const d=document.createElement('div');d.className='small';d.textContent=text;box.append(d);}
  }

  function openSnapshotModal() {
    const box = el('snapshotList');
    const snapshots = loadSnapshots();
    box.innerHTML = ''; renderSnapshotModalSummary();
    if (!snapshots.length) {
      box.innerHTML = `<div class="historyEmpty">${t('backup.snapshotEmpty')}</div>`;
    } else {
      snapshots.forEach(snapshot => {
        const row = document.createElement('div'); row.className = 'snapshotItem';
        const info = document.createElement('div');
        const when = validDate(snapshot.createdAt);
        const title = document.createElement('strong'); title.textContent = when ? localDateTimeLabel(when) : t('backup.snapshotTitle');
        if(snapshot.label){const label=document.createElement('div');label.className='snapshotLabel';label.textContent=snapshot.label;info.append(label);}
        const detail = document.createElement('div'); detail.className = 'small';
        const tierKeys = snapshotTierKeys(snapshot, snapshots), tierText = tierKeys.map(key => t(key)).join(' / ');
        detail.textContent = t('backup.snapshotFrom', {version:snapshot.sourceAppVersion || '—', reason:snapshotReasonLabel(snapshot.reason)}) + (tierText ? ` • ${t('backup.tiers', {tiers:tierText})}` : '');
        const counts=document.createElement('div');counts.className='small';counts.textContent=t('backup.snapshotCountsShort',{fasts:snapshot.fastingRecords||0,weights:snapshot.weightRecords||0,size:humanBytes(snapshot.storedBytes||0)});
        info.append(title, detail, counts);
        const btn = document.createElement('button'); btn.className = 'secondary'; btn.textContent = t('backup.previewAction'); btn.addEventListener('click', () => openSnapshotPreview(snapshot.id));
        row.append(info, btn); box.appendChild(row);
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
    } else if (state === 'deploymentMismatch') {
      updateAvailable = false; status.textContent = message || t('update.deploymentIncomplete'); status.classList.add('warn'); btn.textContent = t('update.check'); btn.disabled = false; banner.hidden = true;
    } else if (state === 'offline') {
      updateAvailable = false; status.textContent = message || t('update.offline'); btn.textContent = t('update.check'); btn.disabled = false; banner.hidden = true;
    } else {
      updateAvailable = false; status.textContent = t('update.current', {version:APP_VERSION}); status.classList.add('good'); btn.textContent = t('update.check'); btn.disabled = false; banner.hidden = true;
    }
  }


  function saveUpdateStatusMeta(){try{localStorage.setItem(UPDATE_STATUS_META_KEY,JSON.stringify({metadataVersion:liveMetadataVersion,entryVersion:liveEntryVersion,state:deploymentConsistencyState,checkedAt:lastUpdateCheckAt}));}catch{}}
  function loadUpdateStatusMeta(){try{const x=JSON.parse(localStorage.getItem(UPDATE_STATUS_META_KEY)||'null');if(x){liveMetadataVersion=x.metadataVersion||null;liveEntryVersion=x.entryVersion||null;deploymentConsistencyState=x.state||'unknown';lastUpdateCheckAt=x.checkedAt||null;}}catch{}}
  async function fetchLiveReleaseStatus(signal){
    const response=await fetch(`./version.json?t=${Date.now()}`,{cache:'no-store',signal});if(!response.ok)throw new Error('version check failed');
    const info=FTReleaseHealth.validateMetadata(await response.json(),UPDATE_PROTOCOL_VERSION);const entryVersion=await FTReleaseHealth.fetchLiveEntryVersion(info.entry,7000);const consistency=FTReleaseHealth.consistency(info.version,entryVersion);
    liveMetadataVersion=info.version;liveEntryVersion=entryVersion;deploymentConsistencyState=consistency.ok?'ok':'mismatch';lastUpdateCheckAt=new Date().toISOString();saveUpdateStatusMeta();return {info,metadataVersion:info.version,entryVersion,consistency};
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
      const live = await fetchLiveReleaseStatus(controller.signal), remote=live.metadataVersion;
      latestVersion = remote;
      if (!live.consistency.ok) { setUpdateUI('deploymentMismatch', t('update.deploymentMismatch',{metadata:live.metadataVersion||'—',entry:live.entryVersion||'—'})); noteDiagnosticError('update.deployment-mismatch');appendDeploymentHistory('mismatch',{version:live.metadataVersion,detail:`entry ${live.entryVersion}`}); }
      else if (compareVersions(remote, APP_VERSION) > 0) {setUpdateUI('available');appendDeploymentHistory('available',{version:remote});}
      else {setUpdateUI('current');if(!quiet)appendDeploymentHistory('current',{version:remote});}
      renderDeploymentStatus();
    } catch (err) {
      noteDiagnosticError('update.'+FTPlatform.errorCategory(err));
      const msg = navigator.onLine === false
        ? t('update.offlineExplicit')
        : t('update.failed');
      setUpdateUI('offline', msg);if(!quiet)appendDeploymentHistory('failed',{version:APP_VERSION,detail:FTPlatform.errorCategory(err)});
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getCurrentServiceWorkerController() {
    if (!('serviceWorker' in navigator)) throw new Error('service worker unavailable');
    const reg = await navigator.serviceWorker.ready;
    let candidate = null;
    let updateFound = false;
    const promote = worker => {
      if (!worker) return;
      const skip = () => {
        if (worker.state === 'installed') {
          try { worker.postMessage({type:'SKIP_WAITING'}); } catch {}
        }
      };
      skip();
      worker.addEventListener?.('statechange', skip);
    };
    const onUpdateFound = () => {
      updateFound = true;
      candidate = reg.installing || candidate;
      promote(candidate);
    };
    reg.addEventListener('updatefound', onUpdateFound);
    try { await reg.update(); } catch {}
    if (reg.installing || reg.waiting) {
      updateFound = true;
      candidate = reg.installing || reg.waiting;
      promote(candidate);
    }
    const isReady = () => {
      const controller = navigator.serviceWorker.controller;
      if (candidate) return candidate.state === 'activated' && reg.active === candidate && controller === candidate;
      return !!reg.active && controller === reg.active;
    };
    if (!updateFound && reg.active && (!navigator.serviceWorker.controller || isReady())) {
      reg.removeEventListener('updatefound', onUpdateFound);
      return reg.active;
    }
    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = error => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener('controllerchange', check);
          candidate?.removeEventListener?.('statechange', check);
          reg.removeEventListener('updatefound', onUpdateFound);
          if (error) reject(error); else resolve();
        };
        const check = () => {
          if (candidate?.state === 'redundant') {
            finish(new Error('new service worker failed to activate'));
            return;
          }
          if (isReady()) finish();
        };
        const timer = setTimeout(() => finish(new Error('service worker controller update timed out')), 20000);
        navigator.serviceWorker.addEventListener('controllerchange', check);
        candidate?.addEventListener?.('statechange', check);
        check();
      });
    } catch (error) {
      reg.removeEventListener('updatefound', onUpdateFound);
      throw error;
    }
    return navigator.serviceWorker.controller || reg.active;
  }

  async function requestShellRefresh(version) {
    const controller = await getCurrentServiceWorkerController();
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
    if (!(await allowStorageIntensiveOperation())) return;
    const preUpdateSnapshot = await createInternalSnapshotAsync(`before updating from v${APP_VERSION} to v${latestVersion}`);
    if (!preUpdateSnapshot) { alert(t('backup.snapshotFailed')); return; }
    beginPendingMigration(APP_VERSION, latestVersion, preUpdateSnapshot.id);
    updateInProgress = true; setUpdateUI('updating');
    try {
      if (navigator.onLine === false) throw new Error('offline');
      await requestShellRefresh(latestVersion);
      window.location.reload();
    } catch (err) {
      noteDiagnosticError('update.stage');
      failPendingMigration(latestVersion, 'update-stage-failed', err);
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

  let pendingDestructiveReset = null;
  let destructiveResetBusy = false;
  function destructiveResetPhrase(kind) { return kind === 'recovery' ? 'RESET DATA' : 'DELETE ALL'; }

