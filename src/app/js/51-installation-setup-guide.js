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

