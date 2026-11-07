
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

  let settingsSearchActive = false;
  let settingsGroupToggleSuppressed = false;

  function settingsGroups() { return [...document.querySelectorAll('#settings .settingsGroup[data-settings-group]')]; }
  function loadSettingsGroupState() {
    try { const x=JSON.parse(localStorage.getItem(SETTINGS_GROUPS_KEY)||'{}'); return x && typeof x==='object' ? x : {}; } catch { return {}; }
  }
  function saveSettingsGroupState() {
    if (settingsSearchActive || settingsGroupToggleSuppressed) return;
    const state={}; settingsGroups().forEach(group=>{state[group.id]=!!group.open;});
    try { localStorage.setItem(SETTINGS_GROUPS_KEY,JSON.stringify(state)); } catch {}
  }
  function restoreSettingsGroupState() {
    const state=loadSettingsGroupState();
    settingsGroupToggleSuppressed=true;
    settingsGroups().forEach(group=>{
      group.hidden=false;
      // Keep app icons prominent by default, but honour the user's saved
      // disclosure choice after they collapse or reopen the section.
      group.open=Object.prototype.hasOwnProperty.call(state,group.id)?!!state[group.id]:(group.id==='settingsGroupAppIcons'||group.id==='settingsGroupGeneral');
    });
    settingsGroupToggleSuppressed=false;
  }
  function normalizeSettingsSearch(value) { return String(value||'').trim().toLocaleLowerCase(uiLanguage()); }
  function applySettingsSearch() {
    const input=el('settingsSearchInput'), clear=el('settingsSearchClearBtn'), status=el('settingsSearchStatus');
    if (!input || !status) return;
    const query=normalizeSettingsSearch(input.value); settingsSearchActive=!!query;
    if (clear) clear.hidden=!query;
    if (!query) { restoreSettingsGroupState(); status.textContent=''; return; }
    settingsGroupToggleSuppressed=true;
    let matches=0;
    settingsGroups().forEach(group=>{
      const hay=normalizeSettingsSearch(group.textContent);
      const matched=hay.includes(query);
      group.hidden=!matched; group.open=matched; if(matched)matches++;
      if (matched) group.querySelectorAll('.settingsSubgroup').forEach(subgroup=>{
        if (normalizeSettingsSearch(subgroup.textContent).includes(query)) subgroup.open=true;
      });
    });
    settingsGroupToggleSuppressed=false;
    status.textContent=matches?t('settings.searchResults',{n:matches}):t('settings.searchNoResults');
    if (el('settingsGroupAdvanced')?.open || el('settingsUpdateAdvanced')?.open) renderStorageHealth();
    if (el('settingsGroupData')?.open) queueStorageProtectionRefresh();
  }
  function initSettingsDisclosure() {
    restoreSettingsGroupState();
    settingsGroups().forEach(group=>group.addEventListener('toggle',()=>{
      // Persist the user's disclosure choice, including a collapsed app-icon section.
      saveSettingsGroupState();
      if (group.id==='settingsGroupAdvanced' && group.open) renderStorageHealth();
      if (group.id==='settingsGroupData' && group.open) queueStorageProtectionRefresh();
    }));
    el('settingsUpdateAdvanced')?.addEventListener('toggle',()=>{if(el('settingsUpdateAdvanced').open)renderStorageHealth();});
    el('settingsSearchInput')?.addEventListener('input',applySettingsSearch);
    el('settingsSearchClearBtn')?.addEventListener('click',()=>{const input=el('settingsSearchInput');if(input){input.value='';input.focus();}applySettingsSearch();});
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
    if (!force && !viewDirty[screen]) {
      // Backup metadata is time-sensitive and can change while a clean Settings
      // screen is hidden (e.g. after an export or a timezone/device change).
      if (screen === 'settings') renderBackupStatus();
      return;
    }
    if (screen === 'fasting') { updateTimer(); renderGamificationSummary(); }
    else if (screen === 'history') renderHistory();
    else if (screen === 'weight') renderWeight();
    else if (screen === 'stats') renderStats();
    else if (screen === 'settings') {
      renderBackupStatus();
      renderSnapshotStatus();
      renderInstallStorageNotice();
      if (el('settingsGroupData')?.open) queueStorageProtectionRefresh();
      renderGamificationDetail();
      renderGamificationSummary();
      renderNotificationSettings();
      if (el('settingsGroupAdvanced')?.open || el('settingsUpdateAdvanced')?.open) renderStorageHealth();
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
    renderNotificationDetails();
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
    updateAppearancePaletteHint();
    if (el('stats').classList.contains('active')) renderStatsVisualizations();
    if (el('weight').classList.contains('active')) drawWeightChart();
  });
  el('timeZoneSearch').addEventListener('input', renderTimeZoneOptions);
  el('timeZoneSelect').addEventListener('change', () => {
    const value = el('timeZoneSelect').value;
    preferredTimeZone = value === 'system' ? null : (isValidTimeZone(value) ? value : null);
    // Daily totals are derived by local calendar day. Rebuild them when the
    // selected zone changes, rather than compare new-zone records with a stale map.
    updateStoredDayTotalsIncrementally();
    persistSmallPreferences();
    invalidateDerivedCaches();
    markViewsDirty();
    renderAll();
    persistDailyTotals(data.revision).catch(() => noteDiagnosticError('daily_totals_persist_failed'));
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
    if (!save({ invalidateDerived:false, dirtyViews:['fasting','stats','settings'] })) { renderAll(); return; }
    renderGamificationSummary();
    renderGamificationDetail();
    viewDirty.fasting = false;
    if (el('stats').classList.contains('active')) viewDirty.stats = false;
  });

  el('notificationMasterToggle').addEventListener('change', () => setNotificationMasterEnabled(el('notificationMasterToggle').checked));
  el('notificationTargetToggle').addEventListener('change', () => saveNotificationOption('targetReached', el('notificationTargetToggle').checked));
  el('notificationBackupToggle').addEventListener('change', () => saveNotificationOption('backupDue', el('notificationBackupToggle').checked));
  el('notificationSafetyToggle').addEventListener('change', () => saveNotificationOption('longFastSafety', el('notificationSafetyToggle').checked));
  el('notificationWeighToggle').addEventListener('change', () => saveNotificationOption('weighIn', el('notificationWeighToggle').checked));
  document.querySelectorAll('[data-notification-cadence]').forEach(btn => bindResponsiveAction(btn, () => setSettingsWeighCadence(btn.dataset.notificationCadence)));
  el('notificationCycleToggle').addEventListener('change', () => saveNotificationOption('cycleComplete', el('notificationCycleToggle').checked));
  el('notificationTestBtn').addEventListener('click', sendTestNotification);

  const APP_DOC_PATHS = Object.freeze(['about.html','privacy.html','branding.html','license.html','changelog.html']);
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
      tab.setAttribute('aria-selected',String(active)); if (active) tab.setAttribute('aria-current','page'); else tab.removeAttribute('aria-current');
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
      if (target === 'stats') verifyStatsVisualizationAfterLayout();
    });
  }

  function installArrowKeyNavigation(container, selector, activate) {
    const node=typeof container==='string'?document.querySelector(container):container;if(!node)return;
    node.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;const items=[...node.querySelectorAll(selector)].filter(x=>!x.disabled&&!x.hidden);if(!items.length)return;let i=Math.max(0,items.indexOf(document.activeElement));if(e.key==='Home')i=0;else if(e.key==='End')i=items.length-1;else if(e.key==='ArrowRight'||e.key==='ArrowDown')i=(i+1)%items.length;else i=(i-1+items.length)%items.length;e.preventDefault();items[i].focus();if(activate)activate(items[i]);});
  }

  document.querySelectorAll('.tab').forEach(tab => bindResponsiveAction(tab, () => activateScreen(tab.dataset.screen)));
  installArrowKeyNavigation(document.querySelector('.tabs'),'.tab',item=>activateScreen(item.dataset.screen));
  installArrowKeyNavigation(el('weightPeriodSwitcher'),'[data-weight-period]',item=>setWeightPeriodMode(item.dataset.weightPeriod));
  installArrowKeyNavigation(el('statsVizGroupSwitcher'),'[data-viz-group]',item=>{if(item.dataset.vizGroup)setStatsVizGroup(item.dataset.vizGroup);});
  el('statsRangeSelect')?.addEventListener('change',e=>changeStatsRange(e.target.value));
  el('statsDrilldownBtn')?.addEventListener('click',openStatsDrilldown);
  el('statsDrilldownCloseBtn')?.addEventListener('click',()=>hideModal('statsDrilldownModal'));
  el('rebuildDerivedBtn')?.addEventListener('click',rebuildDerivedData);
  window.addEventListener('hashchange', () => activateScreen(location.hash.slice(1), { updateHash: false }));

  startEarlierBtn.addEventListener('click', openBackdateModal);
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

  function backupDateRange(candidate){
    const dates=[]; for(const r of [...candidate.records,...candidate.deletedFasts]){const a=validDate(r.start),b=validDate(r.end);if(a)dates.push(a);if(b)dates.push(b);} for(const w of [...candidate.weights,...candidate.deletedWeights]){const d=validDate(w.when);if(d)dates.push(d);} if(!dates.length)return null; dates.sort((a,b)=>a-b); return [dates[0],dates[dates.length-1]];
  }
  function stableRecordString(v){const c={...v};delete c.deleted;delete c.deletedAt;delete c.deletedTimeZone;delete c.deletionReason;return JSON.stringify(c);}
  function mergeByIdAndFingerprint(current,incoming,fingerprint,label){
    const out=[...current], byId=new Map(current.map(x=>[x.id,x])), byFp=new Map(current.map(x=>[fingerprint(x),x])); let duplicates=0;
    for(const item of incoming){const existing=byId.get(item.id);if(existing){if(stableRecordString(existing)!==stableRecordString(item))throw new Error(`${label}: same id differs (${item.id})`);duplicates++;continue;}const fp=fingerprint(item);if(byFp.has(fp)){duplicates++;continue;}out.push(item);byId.set(item.id,item);byFp.set(fp,item);}return {out,duplicates};
  }
  function mergeImportedData(imported){
    const result=JSON.parse(JSON.stringify(data));
    const live=mergeByIdAndFingerprint(result.records,imported.records,r=>`${r.start}|${r.end}|${r.timeZone}|${r.goalHours}|${normalizeStopReason(r.stopReason)||''}`,'fast');
    const del=mergeByIdAndFingerprint(result.deletedFasts,imported.deletedFasts,r=>`${r.start}|${r.end}|${r.deletedAt}|${r.timeZone}|${normalizeStopReason(r.stopReason)||''}`,'deleted fast');
    const weights=mergeByIdAndFingerprint(result.weights,imported.weights,w=>`${w.when}|${w.kg}|${w.timeZone}`,'weight');
    const delWeights=mergeByIdAndFingerprint(result.deletedWeights,imported.deletedWeights,w=>`${w.when}|${w.kg}|${w.deletedAt}|${w.timeZone}`,'deleted weight');
    result.records=live.out;result.deletedFasts=del.out;result.weights=weights.out;result.deletedWeights=delWeights.out;
    const liveIds=new Set(result.records.map(r=>r.id)); if(result.deletedFasts.some(r=>liveIds.has(r.id)))throw new Error('fast exists in both live and deleted history');
    const weightIds=new Set(result.weights.map(w=>w.id)); if(result.deletedWeights.some(w=>weightIds.has(w.id)))throw new Error('weight exists in both live and deleted history');
    const sorted=[...result.records].sort((a,b)=>new Date(a.start)-new Date(b.start)); for(let i=1;i<sorted.length;i++)if(new Date(sorted[i].start)<new Date(sorted[i-1].end))throw new Error('fasting time conflict');
    if(result.activeStart&&imported.activeStart&&result.activeStart!==imported.activeStart)throw new Error('both installations have different active fasts');
    if(!result.activeStart&&imported.activeStart){result.activeStart=imported.activeStart;result.activeGoalHours=imported.activeGoalHours;result.activeTimeZone=imported.activeTimeZone;result.activeCreatedAt=imported.activeCreatedAt;result.activeModifiedAt=imported.activeModifiedAt;}
    return {data:validateCompatibleData(result).data, duplicates:live.duplicates+del.duplicates+weights.duplicates+delWeights.duplicates};
  }
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
  ['fastMonthsChart','fastDistributionChart','fastSuccessChart','fastStartPatternChart'].forEach(id=>{el(id).addEventListener('pointerdown',handleGenericChartPointer);el(id).addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el('statsChartDataBtn').click();if(!el('statsChartData').hidden)el('statsChartData').focus();}});});
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


  function isAndroidDevice() {
    return /Android/i.test(navigator.userAgent || '');
  }

  function isMobileInstallTarget() {
    return isIOSDevice() || isAndroidDevice();
  }

  function loadSetupGuideState() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETUP_GUIDE_KEY) || 'null');
      if (!raw || typeof raw !== 'object' || Number(raw.version) !== SETUP_GUIDE_VERSION) return {version:SETUP_GUIDE_VERSION};
      return {...raw, version:SETUP_GUIDE_VERSION};
    } catch { return {version:SETUP_GUIDE_VERSION}; }
  }

  function saveSetupGuideState(patch = {}) {
    const state = {...loadSetupGuideState(), ...patch, version:SETUP_GUIDE_VERSION};
    try { localStorage.setItem(SETUP_GUIDE_KEY, JSON.stringify(state)); } catch {}
    return state;
  }

  function setSetupStatus(node, text, kind = '') {
    if (!node) return;
    node.textContent = text;
    node.classList.toggle('good', kind === 'good');
    node.classList.toggle('warn', kind === 'warn');
  }

  function setupInstallInstructions() {
    if (isStandaloneApp()) return t('setup.installDetected');
    if (isIOSDevice()) return t('setup.installIOS');
    if (isAndroidDevice()) return t('setup.installAndroid');
    return t('setup.installDesktop');
  }

  function renderSetupInstallStep() {
    const standalone = isStandaloneApp();
    const mobile = isMobileInstallTarget();
    const status = el('setupInstallStatus');
    const extra = el('setupInstallExtra');
    const iconArea = el('setupIconArea');
    const continueBrowser = el('setupContinueBrowserBtn');
    const importExisting = el('setupImportExistingBtn');
    const preBackup = el('setupPreInstallBackupBtn');
    const next = el('setupNextBtn');
    if (iconArea) iconArea.hidden = standalone;
    if (continueBrowser) continueBrowser.hidden = standalone || !mobile;
    if (importExisting) importExisting.hidden = !standalone;
    if (preBackup) preBackup.hidden = standalone || !hasBackupWorthyData();
    setSetupStatus(status, setupInstallInstructions(), standalone ? 'good' : (mobile ? 'warn' : ''));
    if (extra) {
      if (standalone) extra.textContent = t('setup.importHint');
      else if (mobile && hasBackupWorthyData()) extra.textContent = t('setup.preInstallDataText');
      else if (mobile) extra.textContent = t('setup.installRequired');
      else extra.textContent = t('setup.installDesktopExtra');
    }
    if (next) next.disabled = !standalone && mobile;
    applyIconChoice();
  }

  function renderSetupBackupStatus() {
    const node = el('setupBackupStatus');
    const last = validDate(backupMeta.lastExternalBackupAt);
    if (last) setSetupStatus(node, t('setup.backupDone', {date:localDateTimeLabel(last)}), 'good');
    else setSetupStatus(node, t('setup.backupNeeded'), 'warn');
  }

  function renderSetupUnitChoice() {
    const kg = el('setupUnitKgBtn'), lb = el('setupUnitLbBtn');
    if (!kg || !lb) return;
    const isKg = setupWeightUnitChoice === 'kg';
    kg.classList.toggle('active', isKg); lb.classList.toggle('active', !isKg);
    kg.setAttribute('aria-pressed', String(isKg)); lb.setAttribute('aria-pressed', String(!isKg));
  }

  function initializeSetupBasicsControls() {
    const input = el('setupGoalInput'), toggle = el('setupGameToggle'), error = el('setupBasicsError');
    if (input) input.value = formatNumber(data.goalHours, 0, 3);
    setupWeightUnitChoice = normalizeWeightUnit(data.weightUnit);
    renderSetupUnitChoice();
    if (toggle) toggle.checked = data.gamificationEnabled !== false;
    if (error) { error.hidden = true; error.textContent = ''; }
  }

  function initializeSetupNotificationControls() {
    const prefs = notificationPrefs();
    const pairs = [
      ['setupNotificationTargetToggle','targetReached'],
      ['setupNotificationBackupToggle','backupDue'],
      ['setupNotificationSafetyToggle','longFastSafety'],
      ['setupNotificationWeighToggle','weighIn'],
      ['setupNotificationCycleToggle','cycleComplete']
    ];
    pairs.forEach(([id,key]) => { const node=el(id); if (node) node.checked=!!prefs[key]; });
    const cadence=el('setupNotificationWeighCadence');
    if (cadence) renderWeighCadenceButtons('setupNotification', prefs.weighInCadence);
    renderSetupNotificationStatus();
  }

  function renderSetupNotificationStatus() {
    const status=el('setupNotificationStatus'), enable=el('setupEnableNotificationsBtn');
    if (!status || !enable) return;
    const permission=notificationPermissionState();
    if (permission === 'unsupported') {
      setSetupStatus(status, t(isIOSDevice() && !isStandaloneApp() ? 'notifications.statusInstallIOS' : 'setup.notificationsUnavailable'), 'warn');
      enable.hidden=true;
      return;
    }
    enable.hidden=false;
    if (permission === 'denied') {
      setSetupStatus(status, t('setup.notificationsBlocked'), 'warn');
      enable.disabled=true;
      return;
    }
    enable.disabled=false;
    if (permission === 'granted' && notificationPrefs().enabled) setSetupStatus(status, t('setup.notificationsEnabled'), 'good');
    else setSetupStatus(status, t('setup.notificationsReady'));
  }

  function applySetupNotificationChoices() {
    const prefs=notificationPrefs();
    prefs.targetReached=!!el('setupNotificationTargetToggle')?.checked;
    prefs.backupDue=!!el('setupNotificationBackupToggle')?.checked;
    prefs.longFastSafety=!!el('setupNotificationSafetyToggle')?.checked;
    prefs.weighIn=!!el('setupNotificationWeighToggle')?.checked;
    prefs.cycleComplete=!!el('setupNotificationCycleToggle')?.checked;
    prefs.weighInCadence=el('setupNotificationWeighCadence')?.value === 'daily' ? 'daily' : 'weekly';
    if (prefs.weighIn && !validDate(notificationRuntimeState.weighInAnchorAt)) {
      notificationRuntimeState.weighInAnchorAt=new Date().toISOString();
      saveNotificationRuntimeState();
    }
    return save({invalidateDerived:false, dirtyViews:['settings']});
  }

  async function enableSetupNotifications() {
    if (!nativeNotificationsSupported()) { renderSetupNotificationStatus(); return; }
    const btn=el('setupEnableNotificationsBtn');
    if (btn) btn.disabled=true;
    try {
      if (!applySetupNotificationChoices()) return;
      await setNotificationMasterEnabled(true);
      const permission=notificationPermissionState();
      saveSetupGuideState({notificationAttempted:true, notificationEnabled:permission === 'granted' && notificationPrefs().enabled, notificationPermission:permission});
      renderSetupNotificationStatus();
      setSetupGuideStep(6);
    } finally { if (btn && !btn.hidden) btn.disabled=notificationPermissionState() === 'denied'; }
  }

  function skipSetupNotifications() {
    saveSetupGuideState({notificationAttempted:false, notificationEnabled:notificationPrefs().enabled === true, notificationPermission:notificationPermissionState()});
    setSetupGuideStep(6);
  }

  function setupNotificationSummary() {
    const permission=notificationPermissionState();
    if (permission === 'unsupported') return {text:t('setup.statusUnavailable'),good:false};
    if (permission === 'denied') return {text:t('notifications.badgeBlocked'),good:false};
    if (permission === 'granted' && notificationPrefs().enabled) return {text:t('notifications.badgeOn'),good:true};
    return {text:t('notifications.badgeOff'),good:false};
  }

  function setupReadyRow(label, value, kind = '') {
    const row = document.createElement('div'); row.className = 'setupChecklistRow';
    const left = document.createElement('span'); left.textContent = label;
    const right = document.createElement('strong'); right.textContent = value;
    if (kind === 'good') right.style.color = 'var(--accent)';
    row.append(left, right); return row;
  }

  function renderSetupReadySummary() {
    const box = el('setupReadySummary'); if (!box) return;
    box.innerHTML = '';
    box.append(setupReadyRow(t('setup.readyHome'), isStandaloneApp() ? t('setup.statusDone') : t('setup.statusRecommended'), isStandaloneApp() ? 'good' : ''));
    let storageText = t('setup.statusUnknown');
    if (setupStorageResult) {
      if (!setupStorageResult.supported || setupStorageResult.error) storageText = t('setup.statusUnavailable');
      else storageText = setupStorageResult.persistent ? t('setup.statusDone') : t('setup.statusNotProtected');
    }
    box.append(setupReadyRow(t('setup.readyStorage'), storageText, setupStorageResult?.persistent ? 'good' : ''));
    const last = validDate(backupMeta.lastExternalBackupAt);
    box.append(setupReadyRow(t('setup.readyBackup'), last ? t('setup.statusDone') : t('setup.statusNotDone'), last ? 'good' : ''));
    box.append(setupReadyRow(t('setup.readyDefaults'), `${formatNumber(data.goalHours,0,3)}${t('unit.h')} • ${data.weightUnit}`));
    const notificationSummary=setupNotificationSummary();
    box.append(setupReadyRow(t('setup.readyNotifications'), notificationSummary.text, notificationSummary.good ? 'good' : ''));
  }

  function renderSetupGuide() {
    const total = 6;
    setupGuideStep = Math.max(1, Math.min(total, Number(setupGuideStep) || 1));
    document.querySelectorAll('#setupModal [data-setup-step]').forEach(node => { node.hidden = Number(node.dataset.setupStep) !== setupGuideStep; });
    const progress = el('setupProgress'); if (progress) progress.textContent = t('setup.stepProgress', {step:setupGuideStep,total});
    const back = el('setupBackBtn'), next = el('setupNextBtn');
    if (back) back.hidden = setupGuideStep === 1;
    if (next) {
      next.hidden = setupGuideStep === 5;
      next.textContent = t(setupGuideStep === total ? 'setup.finish' : 'setup.continue');
      next.disabled = false;
    }
    if (setupGuideStep === 1) renderSetupInstallStep();
    else if (setupGuideStep === 2) refreshSetupStorageStatus(false);
    else if (setupGuideStep === 3) renderSetupBackupStatus();
    else if (setupGuideStep === 4) initializeSetupBasicsControls();
    else if (setupGuideStep === 5) initializeSetupNotificationControls();
    else if (setupGuideStep === 6) { renderSetupReadySummary(); if (!setupStorageResult) refreshSetupStorageStatus(false); }
  }

  function setSetupGuideStep(step) {
    setupGuideStep = Math.max(1, Math.min(6, Number(step) || 1));
    saveSetupGuideState({started:true, dismissed:false, currentStep:setupGuideStep, awaitStandalone:setupGuideStep === 1 && isMobileInstallTarget() && !isStandaloneApp()});
    renderSetupGuide();
  }

  function openSetupGuide({ automatic = false } = {}) {
    if (recoveryMode || emergencyBoot) return;
    const state = loadSetupGuideState();
    if (automatic && (state.completed || state.dismissed)) return;
    let step = Number(state.currentStep) || 1;
    if (automatic && isStandaloneApp() && (state.awaitStandalone || !hadKnownInstallAtBoot)) step = Math.max(2, step);
    if (!automatic && state.completed) step = 1;
    setupGuideStep = Math.max(1, Math.min(6, step));
    setupWeightUnitChoice = normalizeWeightUnit(data.weightUnit);
    saveSetupGuideState({started:true, dismissed:false, currentStep:setupGuideStep, awaitStandalone:setupGuideStep === 1 && isMobileInstallTarget() && !isStandaloneApp()});
    renderSetupGuide();
    showModal('setupModal', setupGuideStep === 1 ? 'setupDismissBtn' : (setupGuideStep === 5 ? 'setupSkipNotificationsBtn' : 'setupNextBtn'));
  }

  function dismissSetupGuide() {
    saveSetupGuideState({started:false, dismissed:true, currentStep:setupGuideStep, awaitStandalone:false, dismissedAt:new Date().toISOString()});
    hideModal('setupModal');
  }

  function completeSetupGuide() {
    saveSetupGuideState({started:false, dismissed:false, completed:true, currentStep:6, awaitStandalone:false, completedAt:new Date().toISOString()});
    hideModal('setupModal');
    activateScreen('fasting');
    try { window.scrollTo({top:0, behavior:'auto'}); } catch { window.scrollTo(0,0); }
  }

  async function refreshSetupStorageStatus(request = false) {
    const node = el('setupStorageStatus'), usage = el('setupStorageUsage'), btn = el('setupProtectBtn');
    if (!node || !usage || !btn) return null;
    if (!request) setSetupStatus(node, t('storage.checking'));
    btn.disabled = !!request;
    const result = await refreshStorageProtection({request});
    setupStorageResult = result;
    if (!result.supported || result.error) {
      setSetupStatus(node, t('setup.storageUnavailable'), 'warn');
      btn.hidden = true;
    } else if (result.persistent) {
      setSetupStatus(node, t('setup.storageProtected'), 'good');
      btn.hidden = true;
    } else {
      setSetupStatus(node, request ? t('setup.storageDenied') : t('setup.storageBestEffort'), 'warn');
      btn.hidden = !result.requestSupported;
      btn.disabled = false;
    }
    usage.textContent = Number.isFinite(result.used) && Number.isFinite(result.quota)
      ? t('storage.usage', {used:formatBytes(result.used), quota:formatBytes(result.quota)})
      : t('storage.usageUnknown');
    if (request) saveSetupGuideState({storageAttempted:true, storageProtected:!!result.persistent});
    if (setupGuideStep === 6) renderSetupReadySummary();
    return result;
  }

  async function exportSetupBackup({ preInstall = false } = {}) {
    const btn = el(preInstall ? 'setupPreInstallBackupBtn' : 'setupExportBtn');
    if (btn) btn.disabled = true;
    try {
      const ok = await exportBackup();
      if (ok) {
        saveSetupGuideState(preInstall ? {preInstallBackedUpAt:new Date().toISOString()} : {firstBackupAt:new Date().toISOString()});
        if (preInstall) {
          const extra = el('setupInstallExtra'); if (extra) extra.textContent = t('setup.preInstallBackedUp');
        } else renderSetupBackupStatus();
      }
      return ok;
    } finally { if (btn) btn.disabled = false; }
  }

  function applySetupBasics() {
    const input = el('setupGoalInput'), error = el('setupBasicsError');
    const parsed = parseLocalizedNumber(input?.value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_SAFE_GOAL_HOURS) {
      if (error) { error.textContent = t('setup.goalError'); error.hidden = false; }
      input?.focus(); return false;
    }
    let longNoticeSeen = false;
    try { longNoticeSeen = localStorage.getItem(LONG_FAST_NOTICE_KEY) === '1'; } catch {}
    if (parsed >= LONG_FAST_NOTICE_HOURS && parsed !== data.goalHours && !longNoticeSeen) {
      if (error) { error.textContent = t('setup.goalLong'); error.hidden = false; }
      input?.focus(); return false;
    }
    if (error) { error.hidden = true; error.textContent = ''; }
    data.goalHours = parsed;
    data.weightUnit = normalizeWeightUnit(setupWeightUnitChoice);
    data.gamificationEnabled = el('setupGameToggle')?.checked !== false;
    if (!save({invalidateDerived:false, dirtyViews:['fasting','weight','stats','settings']})) return false;
    goalHours.value = formatNumber(data.goalHours,0,3);
    renderGamificationSummary();
    return true;
  }

  function nextSetupGuideStep() {
    if (setupGuideStep === 1) {
      if (isMobileInstallTarget() && !isStandaloneApp()) return;
      setSetupGuideStep(2); return;
    }
    if (setupGuideStep === 2) { setSetupGuideStep(3); return; }
    if (setupGuideStep === 3) { setSetupGuideStep(4); return; }
    if (setupGuideStep === 4) { if (applySetupBasics()) setSetupGuideStep(5); return; }
    if (setupGuideStep === 5) { skipSetupNotifications(); return; }
    completeSetupGuide();
  }

  function maybeAutoOpenSetupGuide() {
    if (setupGuideAutoOpened || recoveryMode || emergencyBoot) return;
    const state = loadSetupGuideState();
    const freshEmptyInstall = !hadKnownInstallAtBoot && !hasBackupWorthyData();
    const shouldResume = state.started && !state.completed && !state.dismissed;
    const shouldResumeAfterInstall = state.awaitStandalone && isStandaloneApp() && !state.completed && !state.dismissed;
    if (!freshEmptyInstall && !shouldResume && !shouldResumeAfterInstall) return;
    setupGuideAutoOpened = true;
    openSetupGuide({automatic:true});
  }

  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '—';
    if (n < 1024) return `${Math.round(n)} B`;
    if (n < 1024 ** 2) return `${formatNumber(n / 1024, 1, 1)} KB`;
    if (n < 1024 ** 3) return `${formatNumber(n / (1024 ** 2), 1, 1)} MB`;
    return `${formatNumber(n / (1024 ** 3), 1, 1)} GB`;
  }

  async function queryStorageProtection({ request = false } = {}) {
    const result = { supported:false, persistent:null, requestSupported:false, attempted:!!request, used:null, quota:null, error:false };
    if (!navigator.storage || typeof navigator.storage.persisted !== 'function') return result;
    result.supported = true;
    result.requestSupported = typeof navigator.storage.persist === 'function';
    try {
      let persistent = await navigator.storage.persisted();
      if (request && !persistent && result.requestSupported) persistent = await navigator.storage.persist();
      result.persistent = !!persistent;
      if (typeof navigator.storage.estimate === 'function') {
        try {
          const est = await navigator.storage.estimate();
          if (Number.isFinite(est?.usage)) result.used = est.usage;
          if (Number.isFinite(est?.quota)) result.quota = est.quota;
        } catch {}
      }
      return result;
    } catch {
      result.error = true;
      result.persistent = null;
      return result;
    }
  }

  async function refreshStorageProtection({ request = false } = {}) {
    const result = await queryStorageProtection({ request });
    const status = el('storageProtectionStatus'), usage = el('storageUsageLabel'), btn = el('storageProtectBtn');
    if (status && usage && btn) {
      if (!result.supported || result.error) {
        status.textContent = t('storage.unavailable');
        usage.textContent = t('storage.usageUnknown');
        btn.hidden = true;
      } else {
        status.textContent = result.persistent ? t('storage.protected') : (request ? t('storage.requestDenied') : t('storage.bestEffort'));
        btn.hidden = !!result.persistent || !result.requestSupported;
        usage.textContent = Number.isFinite(result.used) && Number.isFinite(result.quota)
          ? t('storage.usage', {used:formatBytes(result.used), quota:formatBytes(result.quota)})
          : t('storage.usageUnknown');
      }
    }
    return result;
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
      .then(async reg => {
        const promote=worker=>{if(!worker)return;const send=()=>{if(worker.state==='installed')try{worker.postMessage({type:'SKIP_WAITING'});}catch{}};send();worker.addEventListener?.('statechange',send);};
        promote(reg.waiting);promote(reg.installing);reg.addEventListener?.('updatefound',()=>promote(reg.installing));try{await reg.update();promote(reg.waiting);promote(reg.installing);}catch{}
        if (emergencyBoot) await repairEmergencyBoot(); else checkForUpdates({ quiet: true });
      })
      .catch(() => { if (!emergencyBoot) checkForUpdates({ quiet: true }); });
  } else if (!emergencyBoot) {
    checkForUpdates({ quiet: true });
  }
})();
