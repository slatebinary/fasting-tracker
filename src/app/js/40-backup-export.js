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

  function renderFastingBackupIndicator(freshness, due) {
    const row=el('fastingBackupRow'), header=el('fasting')?.querySelector('.fastingSectionHeader');
    const button=el('fastingBackupStatusBtn'), text=el('fastingBackupStatusText');
    if (!row || !header || !button || !text) return;
    const age = freshness.last ? Date.now() - freshness.last.getTime() : 0;
    const state = freshness.state === 'current' && age >= BACKUP_REMINDER_MS ? 'aged' : freshness.state;
    const visible = state !== 'empty';
    const labelKey = 'backupChip.' + state;
    const descriptionKey = 'backupChip.' + state + 'Help';
    const date = freshness.last ? localDateTimeLabel(freshness.last, deviceTimeZone()) : '';
    const status = t(labelKey);
    const explanation = t(descriptionKey, {date});
    button.dataset.state=state;
    const visibleStatus = freshness.state === 'current' ? `${status} • ${date}` : freshness.last ? `${status} — ${date}` : status;
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
    label.textContent = last ? localDateTimeLabel(last, deviceTimeZone()) : t('backup.noneYet');
    const freshness=backupFreshnessState();
    if(freshnessLabel){freshnessLabel.classList.toggle('good',freshness.state==='current');freshnessLabel.classList.toggle('warn',freshness.state==='stale'||freshness.state==='never');freshnessLabel.textContent=freshness.state==='current'?`${t('backup.current')} — ${localDateTimeLabel(freshness.last, deviceTimeZone())}`:freshness.state==='stale'?t('backup.changedSince'):freshness.state==='never'?t('backup.recommended'):t('backup.noData');}
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
    backupMeta.lastExternalBackupAt = new Date().toISOString();
    backupMeta.lastExternalBackupRevision = Math.max(0,Number(exportedData.revision)||0);
    backupMeta.lastExternalBackupDataUpdatedAt = validDate(exportedData.updatedAt)?.toISOString() || backupMeta.lastExternalBackupAt;
    backupMeta.lastExternalBackupDataSignature = backupDatasetSignature(exportedData);
    saveBackupMeta();
    renderBackupStatus();
    renderGamification();
  }

  const {stableStringify, fnv1a64Hex, checksumText} = window.FTIntegrity;

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
    const algorithm = raw.integrity.algorithm;
    if (algorithm !== 'FNV-1a-64' && algorithm !== 'SHA-256') throw new Error('unsupported backup integrity algorithm');
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

