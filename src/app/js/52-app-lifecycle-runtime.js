// Application lifecycle listeners and recurring tasks. Loaded after initial UI setup.
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

  if(versionTransitionSnapshotOK&&!recoveryMode)setTimeout(async()=>{try{const issues=await collectStartupIntegrityIssues();if(!issues.length)markLastKnownGood('startup-integrity');}catch{}},900);
  if (activeScreenId() === 'settings') queueStorageProtectionRefresh();
  if (!versionTransitionSnapshotOK && !recoveryMode) setTimeout(() => alert(t('backup.snapshotFailed')), 0);
  setInterval(() => {
    if (document.hidden || activeScreenId() !== 'fasting') return;
    if (data.activeStart) updateTimer();
    else {
      updateNonFastingPeriodTimer();
      updateNextFastCountdown();
    }
  }, 1000);
  setTimeout(() => { checkFastNotifications(); checkMaintenanceNotifications(); }, 700);
  setInterval(checkFastNotifications, 15000);
  setInterval(checkMaintenanceNotifications, 15 * 60 * 1000);
  setInterval(() => {
    notificationRuntimeState = loadNotificationRuntimeState();
    if (restoreDueSnoozedNotificationDetails()) renderNotificationDetails();
  }, 30 * 1000);
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

