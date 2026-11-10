  function updateDestructiveResetGuard() {
    const phrase = destructiveResetPhrase(pendingDestructiveReset);
    el('destructiveResetConfirmBtn').disabled = destructiveResetBusy || !pendingDestructiveReset ||
      !el('destructiveResetBackupAck').checked || el('destructiveResetPhrase').value.trim() !== phrase;
  }

  function closeDestructiveReset() {
    if (destructiveResetBusy) return;
    pendingDestructiveReset = null;
    el('destructiveResetPhrase').value = '';
    el('destructiveResetBackupAck').checked = false;
    el('destructiveResetConfirmBtn').disabled = true;
    hideModal('destructiveResetModal');
  }

  function requestDestructiveReset(kind) {
    if (destructiveResetBusy || pendingDestructiveReset || (kind === 'recovery' && !recoveryMode)) return;
    // Stage 1: explicit warning before even showing the second, typed confirmation.
    if (!confirm(t(kind === 'recovery' ? 'recovery.resetConfirm' : 'reset.confirm'))) return;
    pendingDestructiveReset = kind;
    const phrase = destructiveResetPhrase(kind);
    el('destructiveResetTitle').textContent = t(kind === 'recovery' ? 'reset.recoveryTitle' : 'reset.finalTitle');
    el('destructiveResetWarning').textContent = t(kind === 'recovery' ? 'reset.recoveryWarning' : 'reset.finalWarning');
    // Export timestamps are metadata, not proof that a usable file is still stored elsewhere.
    const freshness = backupFreshnessState();
    const last = freshness.last;
    const recent = freshness.state === 'current' && last &&
      Date.now() >= last.getTime() && Date.now() - last.getTime() <= BACKUP_REMINDER_MS;
    el('destructiveResetBackupStatus').textContent = kind === 'recovery'
      ? t('reset.recoveryBackupStatus')
      : t(recent ? 'reset.recordedBackupNotVerified' : 'reset.noVerifiedBackup');
    el('destructiveResetBackupAckLabel').textContent = t('reset.backupAcknowledgement');
    el('destructiveResetPhraseLabel').textContent = t('reset.typePhrase', {phrase});
    el('destructiveResetConfirmBtn').textContent = t(kind === 'recovery' ? 'reset.confirmRecovery' : 'reset.confirmAll');
    el('destructiveResetPhrase').value = '';
    el('destructiveResetBackupAck').checked = false;
    updateDestructiveResetGuard();
    showModal('destructiveResetModal', 'destructiveResetPhrase');
  }

  async function executeDestructiveReset() {
    if (destructiveResetBusy || !pendingDestructiveReset ||
        !el('destructiveResetBackupAck').checked ||
        el('destructiveResetPhrase').value.trim() !== destructiveResetPhrase(pendingDestructiveReset)) return;
    const kind = pendingDestructiveReset;
    destructiveResetBusy = true;
    updateDestructiveResetGuard();
    try {
      if (kind === 'recovery') {
        if (!recoveryMode || !(await persistResolvedDataAtomic(cloneDefault()))) return;
        recoveryMode = null;
      } else {
        // Persist an empty primary before removing the old local recovery stores.
        const empty = cloneDefault();
        empty.revision = 1;
        empty.updatedAt = new Date().toISOString();
        await primaryPersistPromise;
        ++deferredSnapshotTicket;
        await persistFullResetAtomic(empty);
        data = empty;
        persistSmallPreferences();
        storedDayTotalsMap = new Map();
        persistedRecordMap = new Map(); dayTotalsRecordMap = new Map(); persistedDeletedFastMap = new Map(); persistedWeightMap = new Map(); persistedDeletedWeightMap = new Map();
        snapshotCache = [];
        try { localStorage.removeItem(SNAPSHOT_KEY); localStorage.removeItem(LONG_FAST_NOTICE_KEY); localStorage.removeItem('fastingTrackerPublicLang'); localStorage.removeItem(NOTIFICATION_STATE_KEY); } catch {}
        notificationRuntimeState = {};
        backupMeta = { firstSeenAt: new Date().toISOString(), firstDataAt: null, lastExternalBackupAt: null, lastExternalBackupRevision:0, lastExternalBackupDataUpdatedAt:null, snapshotProtectionStatus:'ok', snapshotProtectionAt:null, snapshotStoredCount:0, snapshotDesiredCount:0 };
        try { localStorage.removeItem(PERF_META_KEY); } catch {}
        snapshotProtectionState = { status:'ok', kept:0, desired:0 };
        automaticSnapshotFailureAlerted = false;
        saveBackupMeta();
      }
      pendingDestructiveReset = null;
      destructiveResetBusy = false;
      hideModal('destructiveResetModal');
      invalidateDerivedCaches(); markViewsDirty(); renderAll();
    } catch (err) {
      noteDiagnosticError('destructive_reset_failed');
      alert(t('error.save'));
    } finally {
      destructiveResetBusy = false;
      updateDestructiveResetGuard();
    }
  }

  function resetFromRecovery() { requestDestructiveReset('recovery'); }

  // Modal actions use the browser's completed click activation rather than
  // the pointer-up shortcut used for ordinary controls. This avoids lost taps
  // from small finger drift and prevents touch-through when the modal closes.
  bindReliableModalAction(el('continueOriginalTargetBtn'), keepOriginalTargetAndReturnHome);
  bindReliableModalAction(el('keepFastingBtn'), keepFastingAndReturnHome);
  bindReliableModalAction(el('stopAndSaveBtn'), confirmStopFast);
  bindResponsiveAction(el('stopUndoBtn'), undoStoppedFast);
  bindResponsiveAction(editActiveTargetBtn, openActiveTargetModal);
  el('activeTargetCancelBtn').addEventListener('click', closeActiveTargetModal);
  bindResponsiveAction(el('activeTargetSaveBtn'), () => requestActiveGoalChange(el('activeTargetInput').value));
  el('activeTargetInput').addEventListener('input', () => { showActiveTargetError(''); syncActiveTargetPresetState(); });
  el('activeTargetInput').addEventListener('keydown', e => { if (e.key === 'Enter') requestActiveGoalChange(el('activeTargetInput').value); });
  el('activeTargetInput').addEventListener('input', syncActiveTargetPresetState);

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
  for(const id of ['historyFilterFrom','historyFilterTo','historyFilterMin','historyFilterMax','historyFilterTarget','historyFilterEdited','historyIncludeDeleted'])el(id)?.addEventListener('change',()=>{historyVisibleCount=HISTORY_PAGE_SIZE;deletedHistoryVisibleCount=HISTORY_PAGE_SIZE;selectedFastIds.clear();selectedDeletedFastIds.clear();renderHistory();});
  el('historyClearFiltersBtn')?.addEventListener('click',clearHistoryFilters);
  el('historyBulkModeBtn')?.addEventListener('click',()=>{historyBulkMode=!historyBulkMode;if(!historyBulkMode){selectedFastIds.clear();selectedDeletedFastIds.clear();}renderHistory();});
  el('historySelectVisibleBtn')?.addEventListener('click',()=>{sortedRecordsDesc().filter(r=>fastPassesHistoryFilter(r)).slice(0,historyVisibleCount).forEach(r=>selectedFastIds.add(r.id));renderHistory();});
  el('historyBulkExportBtn')?.addEventListener('click',()=>exportFastRecordsCsv(data.records.filter(r=>selectedFastIds.has(r.id))));
  el('historyBulkDeleteBtn')?.addEventListener('click',()=>bulkDeleteFasts());
  el('deletedFastSelectVisibleBtn')?.addEventListener('click',()=>{data.deletedFasts.filter(r=>fastPassesHistoryFilter(r)).slice(0,deletedHistoryVisibleCount).forEach(r=>selectedDeletedFastIds.add(r.id));renderHistory();});
  el('deletedFastBulkExportBtn')?.addEventListener('click',()=>exportFastRecordsCsv(data.deletedFasts.filter(r=>selectedDeletedFastIds.has(r.id)),'fasting-deleted-selected'));
  el('deletedFastBulkRestoreBtn')?.addEventListener('click',()=>bulkRestoreDeletedFasts());
  el('deletedFastBulkPurgeBtn')?.addEventListener('click',()=>bulkPurgeDeletedFasts());
  el('entryCancelBtn').addEventListener('click', closeEntryModal);
  el('entrySaveBtn').addEventListener('click', saveManualEntry);
  for (const id of ['entryStart','entryEnd','entryGoal']) el(id)?.addEventListener('input', refreshEntryStopReasonVisibility);
  for (const id of ['entryStart','entryEnd','entryGoal']) el(id)?.addEventListener('change', refreshEntryStopReasonVisibility);
  el('entryModal').addEventListener('click', e => { if (e.target === el('entryModal')) closeEntryModal(); });
  bindResponsiveAction(el('addWeightBtn'), () => openWeightModal());
  for(const id of ['weightFilterFrom','weightFilterTo','weightIncludeDeleted'])el(id)?.addEventListener('change',()=>{weightVisibleCount=HISTORY_PAGE_SIZE;selectedWeightIds.clear();selectedDeletedWeightIds.clear();renderWeight();});
  el('weightClearFiltersBtn')?.addEventListener('click',clearWeightFilters);
  el('weightBulkModeBtn')?.addEventListener('click',()=>{weightBulkMode=!weightBulkMode;if(!weightBulkMode){selectedWeightIds.clear();selectedDeletedWeightIds.clear();}renderWeight();});
  el('weightSelectVisibleBtn')?.addEventListener('click',()=>{sortedWeightsAsc().slice().reverse().filter(w=>weightPassesFilter(w)).slice(0,weightVisibleCount).forEach(w=>selectedWeightIds.add(w.id));renderWeight();});
  el('weightBulkExportBtn')?.addEventListener('click',()=>exportWeightRecordsCsv(data.weights.filter(w=>selectedWeightIds.has(w.id))));
  el('weightBulkDeleteBtn')?.addEventListener('click',()=>bulkDeleteWeights());
  el('deletedWeightSelectVisibleBtn')?.addEventListener('click',()=>{data.deletedWeights.filter(w=>weightPassesFilter(w)).slice(0,HISTORY_PAGE_SIZE).forEach(w=>selectedDeletedWeightIds.add(w.id));renderWeight();});
  el('deletedWeightBulkExportBtn')?.addEventListener('click',()=>exportWeightRecordsCsv(data.deletedWeights.filter(w=>selectedDeletedWeightIds.has(w.id)),'weight-deleted-selected'));
  el('deletedWeightBulkRestoreBtn')?.addEventListener('click',()=>bulkRestoreDeletedWeights());
  el('deletedWeightBulkPurgeBtn')?.addEventListener('click',()=>bulkPurgeDeletedWeights());
  el('weightCancelBtn').addEventListener('click', closeWeightModal);
  bindResponsiveAction(el('weightSaveBtn'), saveWeightEntry);
  el('weightModal').addEventListener('click', e => { if (e.target === el('weightModal')) closeWeightModal(); });
  el('unitKgBtn').addEventListener('click', () => setWeightUnit('kg'));
  el('unitLbBtn').addEventListener('click', () => setWeightUnit('lb'));
  document.querySelectorAll('#weightPeriodSwitcher [data-weight-period]').forEach(btn => bindResponsiveAction(btn, () => setWeightPeriodMode(btn.dataset.weightPeriod)));
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
      else if (modal.id === 'destructiveResetModal') closeDestructiveReset();
      else if (modal.id === 'snapshotModal') closeSnapshotModal();
      else if (modal.id === 'snapshotPreviewModal') { pendingSnapshotRestoreId=null; hideModal('snapshotPreviewModal'); }
      else if (modal.id === 'manualSnapshotModal') hideModal('manualSnapshotModal');
      else if (modal.id === 'integrityModal') hideModal('integrityModal');
      else if (modal.id === 'deviceCheckModal') hideModal('deviceCheckModal');
      else if (modal.id === 'editAuditModal') hideModal('editAuditModal');
      else if (modal.id === 'statsDrilldownModal') hideModal('statsDrilldownModal');
      else if (modal.id === 'importPreviewModal') el('importPreviewCancelBtn').click();
      else if (modal.id === 'stopFastModal') closeStopFastModal();
      else if (modal.id === 'setupModal') dismissSetupGuide();
      else if (modal.id === 'longFastModal') { pendingLongFastGoal = null; pendingLongFastScope = 'default'; hideModal('longFastModal'); renderAll(); }
      return;
    }
    if (e.key === 'Tab' && modal) {
      const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [contenteditable="true"], [tabindex]:not([tabindex="-1"])')].filter(node => !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.offsetParent !== null);
      if (!focusable.length) {
        e.preventDefault();
        const dialog = modal.querySelector('[role="dialog"], [role="alertdialog"]');
        if (dialog) { if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1'); dialog.focus(); }
        return;
      }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!modal.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
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
  el('exportEverythingBtn').addEventListener('click', exportEverything);
  el('backupReminderBtn').addEventListener('click', exportBackup);
  el('settingsBackupNowBtn').addEventListener('click', exportBackup);

  function showImportPreview(raw, imported, verification={verified:false,legacy:false}){
    return new Promise(resolve=>{
      const range=backupDateRange(imported);
      const verifiedText = verification.verified ? t('import.checksumVerified',{algorithm:verification.algorithm}) : t('import.legacyUnverified');
      el('importPreviewMeta').textContent=t('import.previewMetaVerified',{version:raw.appVersion,date:localDateTimeLabel(raw.exportedAt),status:verifiedText});
      el('importPreviewCounts').textContent=t('import.previewCountsExtended',{fasts:imported.records.length,deletedFasts:imported.deletedFasts.length,weights:imported.weights.length,deletedWeights:imported.deletedWeights.length,snapshots:Number(raw?.manifest?.recoverySnapshotsOnDevice)||0});
      el('importPreviewRange').textContent=range?t('import.previewRange',{from:localDateLabel(range[0]),to:localDateLabel(range[1])}):t('import.previewEmpty'); el('importPreviewError').hidden=true;
      const finish=v=>{hideModal('importPreviewModal');resolve(v);};
      const c=el('importPreviewCancelBtn'),r=el('importPreviewReplaceBtn'),m=el('importPreviewMergeBtn');
      c.onclick=()=>finish('cancel');r.onclick=()=>finish('replace');m.onclick=()=>finish('merge');showModal('importPreviewModal','importPreviewCancelBtn');
    });
  }

  el('importBtn').addEventListener('click', () => el('importFile').click());
  el('importFile').addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (!(await allowStorageIntensiveOperation())) { e.target.value=''; return; }
      if (f.size > MAX_IMPORT_BYTES) throw new Error('backup file too large');
      const parsedImport = JSON.parse(await f.text());
      const raw = parsedImport?.format === 'fasting-tracker-export-bundle' && parsedImport.backup ? parsedImport.backup : parsedImport;
      if (!raw || typeof raw !== 'object' || raw.format !== BACKUP_FORMAT || !Number.isInteger(Number(raw.backupVersion)) || Number(raw.backupVersion) < BACKUP_MIN_VERSION || Number(raw.backupVersion) > BACKUP_VERSION || !raw.data) {
        throw new Error('invalid backup format');
      }
      if (typeof raw.appVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(raw.appVersion) || !validDate(raw.exportedAt)) {
        throw new Error('invalid backup metadata');
      }
      const verification = await verifyBackupEnvelope(raw);
      const imported = validateCompatibleData(raw.data).data;
      const choice = await showImportPreview(raw, imported, verification);
      if (choice === 'cancel') { e.target.value=''; return; }
      let resolved = imported;
      if (choice === 'merge') {
        try { const merged=mergeImportedData(imported); resolved=merged.data; }
        catch(err){ alert(t('import.mergeConflict',{detail:String(err?.message||err)})); e.target.value=''; return; }
      }
      if (!recoveryMode) {
        if (!await createInternalSnapshotAsync('before importing an external backup')) { alert(t('backup.snapshotFailed')); e.target.value = ''; return; }
      }
      if (!await persistResolvedDataAtomic(resolved)) { e.target.value = ''; return; }
      renderAll();
      if (!el('setupModal')?.hidden) renderSetupGuide();
      alert(t('import.done'));
    } catch {
      alert(t('import.invalid'));
    }
    e.target.value = '';
  });

  el('resetBtn').addEventListener('click', () => requestDestructiveReset('all'));
  el('destructiveResetBackupAck').addEventListener('change', updateDestructiveResetGuard);
  el('destructiveResetPhrase').addEventListener('input', updateDestructiveResetGuard);
  el('destructiveResetConfirmBtn').addEventListener('click', executeDestructiveReset);
  el('destructiveResetCancelBtn').addEventListener('click', closeDestructiveReset);
  el('destructiveResetModal').addEventListener('click', e => { if (e.target === el('destructiveResetModal')) closeDestructiveReset(); });

  el('restoreSnapshotBtn').addEventListener('click', openSnapshotModal);
  el('snapshotCloseBtn').addEventListener('click', closeSnapshotModal);
  el('snapshotModal').addEventListener('click', e => { if (e.target === el('snapshotModal')) closeSnapshotModal(); });

  initSettingsDisclosure();

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
  el('statsVizGroupSwitcher').addEventListener('pointerdown', handleStatsVizGroupPointerDown);
  el('statsVizGroupSwitcher').addEventListener('click', handleStatsVizGroupClick);
  el('statsVizSelect').addEventListener('change', event => setStatsVizMode(event.target.value));
  el('fastCalendar').addEventListener('keydown',handleCalendarGridKeydown);
  el('calendarPrevBtn').addEventListener('click', () => { statsCalendarMonthOffset -= 1; statsDetailOverride = null; renderFastCalendar(); });
  el('calendarNextBtn').addEventListener('click', () => { if (statsCalendarMonthOffset < 0) statsCalendarMonthOffset += 1; statsDetailOverride = null; renderFastCalendar(); });
  el('fastTrendChart').addEventListener('pointerdown', handleTrendPointer);
  el('fastWeeksChart').addEventListener('pointerdown', handleWeeksPointer);
  ['fastTrendChart','fastWeeksChart'].forEach(id=>el(id).addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el('statsChartDataBtn').click();if(!el('statsChartData').hidden)el('statsChartData').focus();}}));
  ['fastMonthsChart','fastDistributionChart','fastSuccessChart','fastStartPatternChart'].forEach(id=>{el(id).addEventListener('pointerdown',handleGenericChartPointer);el(id).addEventListener('click',handleGenericChartClick);el(id).addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el('statsChartDataBtn').click();if(!el('statsChartData').hidden)el('statsChartData').focus();}});});
  el('fastCumulativeChart')?.addEventListener('pointerdown',beginCumulativePointer);el('fastCumulativeChart')?.addEventListener('pointermove',moveCumulativePointer);el('fastCumulativeChart')?.addEventListener('pointerup',finishCumulativePointer);el('fastCumulativeChart')?.addEventListener('pointercancel',cancelCumulativePointer);el('fastCumulativeChart')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el('statsChartDataBtn').click();if(!el('statsChartData').hidden)el('statsChartData').focus();}});
  el('weightChart').addEventListener('pointerdown', beginWeightChartPointer);
  el('weightChart').addEventListener('pointerup', finishWeightChartPointer);
  el('weightChart').addEventListener('pointercancel', cancelWeightChartPointer);
  el('weightChartRange').addEventListener('input',()=>navigateWeightChartToIndex(Number(el('weightChartRange').value)));
  el('weightChartOlderBtn').addEventListener('click',()=>shiftWeightChartViewport(-1));
  el('weightChartNewerBtn').addEventListener('click',()=>shiftWeightChartViewport(1));
  el('weightChartDataBtn').addEventListener('click',()=>{const box=el('weightChartData'),btn=el('weightChartDataBtn');box.hidden=!box.hidden;btn.setAttribute('aria-expanded',String(!box.hidden));btn.textContent=box.hidden?t('a11y.showChartData'):t('a11y.hideChartData');renderWeightChartData();if(!box.hidden)box.setAttribute('tabindex','0');});
  el('weightChart').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){if(!weightChartBuckets.length)return;e.preventDefault();const valid=weightChartBuckets.filter(b=>b.count>0),current=valid.findIndex(b=>b.key===weightChartSelectedId),base=current<0?(e.key==='ArrowRight'?valid.length-1:0):current,next=Math.max(0,Math.min(valid.length-1,base+(current<0?0:(e.key==='ArrowRight'?1:-1))));const bucket=valid[next];if(bucket){weightChartSelectedId=bucket.key;const visible=weightChartHitPoints.some(p=>p.id===bucket.key);if(!visible){const scroller=el('weightChartScroller');const index=weightChartBuckets.findIndex(b=>b.key===bucket.key);const spacing=weightChartPointSpacing();scroller.scrollLeft=Math.max(0,16+index*spacing-scroller.clientWidth/2);}drawWeightChart();}return;}if(e.key==='Enter'||e.key===' '){e.preventDefault();el('weightChartDataBtn').click();if(!el('weightChartData').hidden)el('weightChartData').focus();}});
  el('statsHistoryOlderBtn')?.addEventListener('click',()=>shiftStatsHistory(-1));
  el('statsHistoryNewerBtn')?.addEventListener('click',()=>shiftStatsHistory(1));
  el('statsHistoryRange')?.addEventListener('input',()=>selectStatsHistoryIndex(Number(el('statsHistoryRange').value)));
  el('statsChartDataBtn').addEventListener('click',()=>{const box=el('statsChartData'),btn=el('statsChartDataBtn');box.hidden=!box.hidden;btn.setAttribute('aria-expanded',String(!box.hidden));btn.textContent=box.hidden?t('a11y.showChartData'):t('a11y.hideChartData');renderStatsChartData();if(!box.hidden)box.setAttribute('tabindex','0');});
  el('chart').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el('statsChartDataBtn').click();if(!el('statsChartData').hidden)el('statsChartData').focus();}});
  el('diagnosticExportBtn').addEventListener('click',exportDiagnostics);
  el('integrityCheckBtn').addEventListener('click',runDataIntegrityCheck);
  el('integrityCopyBtn').addEventListener('click',copyIntegrityReport);
  el('integrityCloseBtn').addEventListener('click',()=>hideModal('integrityModal'));
  el('createSnapshotBtn').addEventListener('click',openManualSnapshotModal);
  el('snapshotCreateNowBtn').addEventListener('click',async()=>{
    const btn=el('snapshotCreateNowBtn');if(btn)btn.disabled=true;
    try{announceDiagnosticAction(t('actionFeedback.snapshotRunning'),'info');const ok=await createManualRecoverySnapshot();if(ok)alert(t('actionFeedback.snapshotCreated'));else announceDiagnosticAction(t('actionFeedback.snapshotFailed'),'error');}
    catch(err){noteDiagnosticError('snapshot.manual-now');announceDiagnosticAction(t('actionFeedback.snapshotFailed'),'error');alert(t('backup.snapshotFailed'));}
    finally{if(btn)btn.disabled=false;}
  });
  el('manualSnapshotCancelBtn').addEventListener('click',()=>hideModal('manualSnapshotModal'));
  el('manualSnapshotSaveBtn').addEventListener('click',saveManualSnapshotFromModal);
  el('manualSnapshotModal').addEventListener('click',e=>{if(e.target===el('manualSnapshotModal'))hideModal('manualSnapshotModal');});
  el('repairCacheBtn').addEventListener('click',repairAppCache);
  el('performanceTestBtn').addEventListener('click',runLocalBenchmark);
  el('deviceChecksBtn').addEventListener('click',runDeviceChecks);
  el('deviceCheckCloseBtn').addEventListener('click',()=>hideModal('deviceCheckModal'));
  el('emptyDeletedBtn').addEventListener('click',emptyRecentlyDeleted);
  el('snapshotPreviewCancelBtn').addEventListener('click',()=>{pendingSnapshotRestoreId=null;hideModal('snapshotPreviewModal');});
  el('snapshotPreviewRestoreBtn').addEventListener('click',()=>{if(pendingSnapshotRestoreId)performSnapshotRestore(pendingSnapshotRestoreId);});
  el('editAuditCloseBtn').addEventListener('click',()=>hideModal('editAuditModal'));
  el('exportFastCsvBtn').addEventListener('click',exportFastingCsv);
  el('exportWeightCsvBtn').addEventListener('click',exportWeightCsv);
  el('undoToastBtn').addEventListener('click',()=>{const action=undoToastAction;clearUndoToast();try{action?.();}catch{}});
  el('weightChartScroller').addEventListener('scroll', handleWeightChartScroll, {passive:true});
  let resizeRenderFrame=0;window.addEventListener('resize',()=>{if(resizeRenderFrame)return;resizeRenderFrame=requestAnimationFrame(()=>{resizeRenderFrame=0;markViewsDirty('stats','weight');if(el('stats').classList.contains('active'))renderScreen('stats');if(el('weight').classList.contains('active'))renderScreen('weight');});});
  window.addEventListener('online', () => { if (!emergencyBoot) checkForUpdates({ quiet: true }); });
  window.addEventListener('offline', () => setUpdateUI('offline', t('update.offlineExplicit')));
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type !== 'OPEN_SCREEN') return;
    const screen = APP_SCREENS.includes(event.data.screen) ? event.data.screen : 'fasting';
    activateScreen(screen);
    try { window.focus(); } catch {}
  });
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage) return;
    if (event.key === DATA_REVISION_SIGNAL_KEY) {
      reloadFromIndexedDB({ notify: false });
      return;
    }
    if (event.key === BACKUP_META_KEY) {
      reloadBackupMetaFromStorage();
      renderBackupStatus(); renderSnapshotStatus(); renderGamificationSummary(); if (el('stats').classList.contains('active') || el('settings').classList.contains('active')) renderGamificationDetail();
    }
    if (event.key === NOTIFICATION_STATE_KEY) {
      notificationRuntimeState = loadNotificationRuntimeState();
      renderNotificationDetails();
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { flushPrimaryPersistence(); return; } reloadBackupMetaFromStorage(); markViewsDirty(); renderBackupStatus(); renderNotificationSettings(); renderNotificationDetails(); renderScreen(activeScreenId()); if(activeScreenId()==='settings')renderStorageHealth(); checkFastNotifications(); checkMaintenanceNotifications(); if (!emergencyBoot) checkForUpdates({ quiet: true }); });
  // Safari may restore the installed PWA from the back-forward cache after a
  // documentation page. Restore its already loaded UI instead of writing an
  // uninitialized in-memory default over the user's IndexedDB history.
  window.addEventListener('pageshow', event => {
    if (!event.persisted || !uiReady) return;
    try {
      const target = location.hash.slice(1);
      activateScreen(APP_SCREENS.includes(target) ? target : 'fasting', {updateHash:false});
      markViewsDirty();
      renderScreen(activeScreenId(), {force:true});
      updateTimer();
      reloadBackupMetaFromStorage();
      renderBackupStatus();
    } catch (err) { noteDiagnosticError('document-return-resume'); console.error(err); }
  });
  window.addEventListener('pagehide', () => { flushPrimaryPersistence(); });

  el('installStorageDismiss').addEventListener('click', () => { try { localStorage.setItem(INSTALL_NOTICE_KEY, '1'); } catch {} renderInstallStorageNotice(); });
  el('installStorageSetupBtn').addEventListener('click', () => openSetupGuide());
  el('storageProtectBtn').addEventListener('click', () => refreshStorageProtection({ request: true }));
  el('setupGuideBtn').addEventListener('click', () => openSetupGuide());
  el('setupDismissBtn').addEventListener('click', dismissSetupGuide);
  el('setupBackBtn').addEventListener('click', () => setSetupGuideStep(setupGuideStep - 1));
  el('setupNextBtn').addEventListener('click', nextSetupGuideStep);
  el('setupContinueBrowserBtn').addEventListener('click', () => { saveSetupGuideState({awaitStandalone:false}); setSetupGuideStep(2); });
  el('setupImportExistingBtn').addEventListener('click', () => el('importFile').click());
  el('setupPreInstallBackupBtn').addEventListener('click', () => exportSetupBackup({preInstall:true}));
  el('setupProtectBtn').addEventListener('click', () => refreshSetupStorageStatus(true));
  el('setupStorageImportBtn').addEventListener('click', () => el('importFile').click());
  el('setupExportBtn').addEventListener('click', () => exportSetupBackup());
  el('setupEnableNotificationsBtn').addEventListener('click', enableSetupNotifications);
  el('setupSkipNotificationsBtn').addEventListener('click', skipSetupNotifications);
  document.querySelectorAll('[data-setup-notification-cadence]').forEach(btn => bindResponsiveAction(btn, () => renderWeighCadenceButtons('setupNotification', btn.dataset.setupNotificationCadence)));
  document.querySelectorAll('#setupIconArea .iconChoice[data-icon-choice]').forEach(btn => btn.addEventListener('click', () => {
    if (isStandaloneApp()) return;
    try { const u=new URL(location.href); u.searchParams.set('icon', normalizeIconChoice(btn.dataset.iconChoice)); history.replaceState(null,'',u); } catch {}
  }));
  el('setupUnitKgBtn').addEventListener('click', () => { setupWeightUnitChoice='kg'; renderSetupUnitChoice(); });
  el('setupUnitLbBtn').addEventListener('click', () => { setupWeightUnitChoice='lb'; renderSetupUnitChoice(); });
  document.querySelectorAll('[data-setup-goal]').forEach(btn => btn.addEventListener('click', () => { const input=el('setupGoalInput'); if (input) input.value=formatNumber(Number(btn.dataset.setupGoal),0,3); }));

  bindResponsiveAction(el('fastingBackupStatusBtn'), () => exportBackup());
  bindResponsiveAction(el('shareProgressBtn'), openShareModal);
  bindResponsiveAction(el('shareStatsBtn'), openShareModal);
  el('shareCancelBtn').addEventListener('click', closeShareModal);
  el('shareCopyBtn').addEventListener('click', copyShareProgress);
  el('shareNativeBtn').addEventListener('click', shareProgress);
  el('shareModal').addEventListener('click', e => { if (e.target === el('shareModal')) closeShareModal(); });
  for (const id of ['shareFastToggle','shareStatsToggle','shareConsistencyToggle','shareWeightToggle']) {
    el(id).addEventListener('change', () => { el('shareStatus').textContent=''; renderSharePreview(); });
  }

  el('appVersionLabel').textContent = `v${APP_VERSION}`;
  const patientTortoiseTrigger = el('appVersionLabel');
  let patientTortoiseTapCount = 0;
  const patientTortoiseProgress = el('patientTortoiseProgress');
  const patientTortoiseTapMessageKeys = ['easterEgg.patientTortoiseTap1','easterEgg.patientTortoiseTap2','easterEgg.patientTortoiseTap3','easterEgg.patientTortoiseTap4','easterEgg.patientTortoiseTap5','easterEgg.patientTortoiseTap6'];
  const revealPatientTortoise = () => {
    patientTortoiseTapCount += 1;
    if (patientTortoiseTapCount < 7) {
      patientTortoiseProgress.textContent = '';
      const count = document.createElement('span');
      count.className = 'tapCount';
      count.textContent = t('easterEgg.patientTortoiseProgress').replace('{count}', String(patientTortoiseTapCount));
      patientTortoiseProgress.append(count, document.createTextNode(' ' + t(patientTortoiseTapMessageKeys[patientTortoiseTapCount - 1])));
      patientTortoiseProgress.hidden = false;
      patientTortoiseProgress.classList.remove('isNew');
      void patientTortoiseProgress.offsetWidth;
      patientTortoiseProgress.classList.add('isNew');
      return;
    }
    patientTortoiseTapCount = 0;
    patientTortoiseProgress.hidden = true;
    patientTortoiseProgress.textContent = '';
    const surprise = el('patientTortoise');
    surprise.hidden = false;
    surprise.classList.remove('isRevealed');
    void surprise.offsetWidth;
    surprise.classList.add('isRevealed');
    el('patientTortoiseDismiss').focus();
  };
  patientTortoiseTrigger.setAttribute('aria-label', t('easterEgg.patientTortoiseTrigger'));
  patientTortoiseTrigger.addEventListener('click', revealPatientTortoise);
  patientTortoiseTrigger.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); revealPatientTortoise(); }
  });
  el('patientTortoiseDismiss').addEventListener('click', () => {
    el('patientTortoise').hidden = true;
    patientTortoiseTrigger.focus();
  });
  el('appFooterVersion').textContent = `Fasting Tracker v${APP_VERSION}`;
  uiReady = true;
  persistUrlLanguageOverride();
  persistUrlIconOverride();
  applyPreferencesIfChanged(true);
  applyRecoveryMode();
  renderBackupStatus();
  renderInstallStorageNotice();
  renderNotificationDetails();
  activateScreen(location.hash.slice(1), { updateHash: false });
  renderScreen(activeScreenId(), { force:true });
  if(versionTransitionSnapshotOK&&!recoveryMode)setTimeout(async()=>{try{const issues=await collectStartupIntegrityIssues();if(!issues.length)markLastKnownGood('startup-integrity');}catch{}},900);
  if (activeScreenId() === 'settings') queueStorageProtectionRefresh();
  if (!versionTransitionSnapshotOK && !recoveryMode) setTimeout(() => alert(t('backup.snapshotFailed')), 0);
  setInterval(() => {
    if (document.hidden || activeScreenId() !== 'fasting') return;
    if (data.activeStart) updateTimer();
    else updateNextFastCountdown();
  }, 1000);
  setTimeout(() => { checkFastNotifications(); checkMaintenanceNotifications(); }, 700);
  setInterval(checkFastNotifications, 15000);
  setInterval(checkMaintenanceNotifications, 15 * 60 * 1000);
  setInterval(() => {
    if (document.hidden) return;
    const screen = activeScreenId();
    if (!data.activeStart && screen === 'fasting') updateTimer();
    else if (data.activeStart && screen === 'stats') { invalidateDerivedCaches(); markViewsDirty('stats'); renderScreen('stats'); }
  }, 60 * 1000);
  if (hasBackupWorthyData() && loadSnapshots().length === 0) maybeCreateRollingSnapshot('automatic change');
    setInterval(renderBackupStatus, 60 * 60 * 1000);

  queueStorageProtectionRefresh();
  setTimeout(maybeAutoOpenSetupGuide, 180);
