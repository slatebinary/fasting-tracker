// Screen navigation, render scheduling, and goal-change orchestration.
// Keep declarations in the ordered shared application scope.
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
