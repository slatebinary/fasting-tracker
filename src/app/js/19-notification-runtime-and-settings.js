  function nativeNotificationsSupported() {
    return typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function';
  }

  function notificationPermissionState() {
    if (!nativeNotificationsSupported()) return 'unsupported';
    return Notification.permission || 'default';
  }

  function notificationPrefs() {
    data.notificationPreferences = normalizeNotificationPreferences(data.notificationPreferences);
    return data.notificationPreferences;
  }

  function notificationEnabledFor(key) {
    const prefs = notificationPrefs();
    return prefs.enabled === true && prefs[key] === true && notificationPermissionState() === 'granted';
  }

  async function sendDeviceNotification(kind, title, body, {screen='fasting', tag=null, detailParams={}} = {}) {
    if (notificationPermissionState() !== 'granted') return false;
    const detailId = String(tag || `fasting-tracker-${kind}`);
    const options = {
      body,
      tag: detailId,
      renotify: false,
      icon: 'icons/icon-192.png',
      badge: 'icons/favicon-32.png',
      data: { screen, kind, detailId }
    };
    let sent = false;
    try {
      if (navigator.serviceWorker?.ready) {
        const registration = await navigator.serviceWorker.ready;
        if (registration?.showNotification) { await registration.showNotification(title, options); sent = true; }
      }
    } catch {}
    if (!sent) { try { new Notification(title, options); sent = true; } catch {} }
    if (sent) recordNotificationDetail(kind, {screen, tag:detailId, params:detailParams});
    return sent;
  }

  async function maybeNotifyTargetReached(nowMs = Date.now()) {
    if (!notificationEnabledFor('targetReached') || !data.activeStart) return false;
    const startMs = new Date(data.activeStart).getTime();
    const target = activeTargetHours();
    const targetMs = goalMs(target);
    if (!Number.isFinite(startMs) || nowMs < startMs + targetMs) return false;
    const token = `${data.activeStart}|${target}`;
    if (notificationRuntimeState.targetReachedToken === token) return false;
    const sent = await sendDeviceNotification('target', t('notifications.targetTitle'), t('notifications.targetBodyShort', {target:formatGoal(target)}), {screen:'fasting',tag:`fasting-target-${token}`,detailParams:{targetHours:target}});
    if (sent) { notificationRuntimeState.targetReachedToken = token; saveNotificationRuntimeState(); }
    return sent;
  }

  async function maybeNotifyLongFastSafety(nowMs = Date.now()) {
    if (!notificationEnabledFor('longFastSafety') || !data.activeStart) return false;
    const startMs = new Date(data.activeStart).getTime();
    if (!Number.isFinite(startMs) || nowMs < startMs + 24 * 3600000) return false;
    const token = String(data.activeStart);
    if (notificationRuntimeState.longFastSafetyToken === token) return false;
    const sent = await sendDeviceNotification('safety', t('notifications.safetyTitle'), t('notifications.safetyBodyShort'), {screen:'fasting',tag:`fasting-safety-${token}`});
    if (sent) { notificationRuntimeState.longFastSafetyToken = token; saveNotificationRuntimeState(); }
    return sent;
  }

  async function maybeNotifyCycleComplete(nowMs = Date.now()) {
    if (!notificationEnabledFor('cycleComplete') || data.activeStart) return false;
    const record = latestCompletedFast();
    if (!record) return false;
    const startMs = new Date(record.start).getTime(), endMs = new Date(record.end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || endMs - startMs >= 24 * 3600000) return false;
    const cycleEnd = startMs + 24 * 3600000;
    if (nowMs < cycleEnd) return false;
    const enabledAt = validDate(notificationRuntimeState.enabledAt);
    if (!enabledAt) { notificationRuntimeState.enabledAt = new Date(nowMs).toISOString(); saveNotificationRuntimeState(); return false; }
    if (cycleEnd < enabledAt.getTime()) return false;
    if (notificationRuntimeState.cycleCompleteToken === record.id) return false;
    const sent = await sendDeviceNotification('cycle', t('notifications.cycleTitle'), t('notifications.cycleBodyShort'), {screen:'fasting',tag:`fasting-cycle-${record.id}`});
    if (sent) { notificationRuntimeState.cycleCompleteToken = record.id; saveNotificationRuntimeState(); }
    return sent;
  }

  function backupDueToken() {
    if (!backupIsDue()) return null;
    const first = validDate(backupMeta.firstDataAt);
    const last = validDate(backupMeta.lastExternalBackupAt);
    const base = last && first ? new Date(Math.max(last.getTime(), first.getTime())) : (last || first);
    return base ? base.toISOString() : 'due';
  }

  async function maybeNotifyBackupDue() {
    if (!notificationEnabledFor('backupDue')) return false;
    const token = backupDueToken();
    if (!token || notificationRuntimeState.backupDueToken === token) return false;
    const sent = await sendDeviceNotification('backup', t('notifications.backupTitle'), t('notifications.backupBodyShort'), {screen:'settings',tag:`fasting-backup-${token}`});
    if (sent) { notificationRuntimeState.backupDueToken = token; saveNotificationRuntimeState(); }
    return sent;
  }

  function latestWeightRecord() {
    let latest = null, latestMs = -Infinity;
    for (const weight of data.weights) {
      const ms = new Date(weight.when).getTime();
      if (Number.isFinite(ms) && ms > latestMs) { latest = weight; latestMs = ms; }
    }
    return latest;
  }

  // Prevent overlapping startup, foreground and timer checks from delivering the
  // same weigh-in reminder more than once. Web Locks coordinate separate tabs;
  // the persisted short lease is the fallback and recovers automatically after a crash.
  let weighInNotificationPromise = null;

  async function maybeNotifyWeighIn(nowMs = Date.now()) {
    if (weighInNotificationPromise) return weighInNotificationPromise;
    const run = async () => {
    const prefs = notificationPrefs();
    if (!notificationEnabledFor('weighIn')) return false;
    const cadenceMs = prefs.weighInCadence === 'daily' ? 24 * 3600000 : 7 * 24 * 3600000;
    const latest = latestWeightRecord();
    let anchorMs, tokenBase;
    if (latest) { anchorMs = new Date(latest.when).getTime(); tokenBase = latest.id; }
    else {
      let anchor = validDate(notificationRuntimeState.weighInAnchorAt);
      if (!anchor) { anchor = new Date(nowMs); notificationRuntimeState.weighInAnchorAt = anchor.toISOString(); saveNotificationRuntimeState(); }
      anchorMs = anchor.getTime(); tokenBase = notificationRuntimeState.weighInAnchorAt;
    }
    if (!Number.isFinite(anchorMs) || nowMs < anchorMs + cadenceMs) return false;
    const token = `${prefs.weighInCadence}:${tokenBase}`;
    if (notificationRuntimeState.weighInToken === token) return false;
    const reservation = notificationRuntimeState.weighInReservation;
    const reservedAt = Number(reservation?.reservedAt);
    if (reservation?.token === token && Number.isFinite(reservedAt) && Date.now() - reservedAt < 120000) return false;

    // Reserve synchronously before the first await. Other app contexts will see
    // the reservation even where the Web Locks API is unavailable.
    notificationRuntimeState.weighInReservation = {token, reservedAt:Date.now()};
    saveNotificationRuntimeState();
    const cadence = t(prefs.weighInCadence === 'daily' ? 'notifications.daily' : 'notifications.weekly').toLowerCase();
    let sent = false;
    try {
      sent = await sendDeviceNotification('weigh-in', t('notifications.weighTitle'), t('notifications.weighBodyShort', {cadence}), {screen:'weight',tag:`fasting-weigh-${token}`,detailParams:{cadence:prefs.weighInCadence}});
      if (sent) notificationRuntimeState.weighInToken = token;
      return sent;
    } finally {
      if (notificationRuntimeState.weighInReservation?.token === token) delete notificationRuntimeState.weighInReservation;
      saveNotificationRuntimeState();
    }
    };
    const operation = typeof navigator.locks?.request === 'function'
      ? navigator.locks.request('fasting-tracker-weigh-in-reminder', run)
      : run();
    weighInNotificationPromise = operation;
    try { return await operation; }
    finally { if (weighInNotificationPromise === operation) weighInNotificationPromise = null; }
  }

  async function checkFastNotifications() {
    await maybeNotifyTargetReached();
    await maybeNotifyLongFastSafety();
    await maybeNotifyCycleComplete();
  }

  async function checkMaintenanceNotifications() {
    await maybeNotifyBackupDue();
    await maybeNotifyWeighIn();
  }

  function notificationDiagnosticState() {
    if (!nativeNotificationsSupported()) return isIOSDevice() && !isStandaloneApp() ? 'install-required' : 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission === 'granted') return notificationPrefs().enabled ? 'enabled' : 'permission-granted-off';
    return 'not-requested';
  }

  function notificationStatusKey() {
    const state = notificationDiagnosticState();
    return ({'install-required':'notifications.statusInstallIOS','unsupported':'notifications.statusUnsupported','blocked':'notifications.statusBlocked','enabled':'notifications.statusAllowed','permission-granted-off':'notifications.statusPermissionGrantedOff','not-requested':'notifications.statusNotRequested'})[state];
  }

  function renderWeighCadenceButtons(prefix, cadence) {
    const value = cadence === 'daily' ? 'daily' : 'weekly';
    const input = el(`${prefix}WeighCadence`);
    if (input) input.value = value;
    const daily = el(`${prefix}WeighDailyBtn`), weekly = el(`${prefix}WeighWeeklyBtn`);
    if (daily) { const active=value==='daily'; daily.classList.toggle('active',active); daily.setAttribute('aria-pressed',String(active)); }
    if (weekly) { const active=value==='weekly'; weekly.classList.toggle('active',active); weekly.setAttribute('aria-pressed',String(active)); }
  }

  function setSettingsWeighCadence(cadence) {
    const prefs = notificationPrefs();
    prefs.weighInCadence = cadence === 'daily' ? 'daily' : 'weekly';
    notificationRuntimeState.weighInToken = null;
    saveNotificationRuntimeState();
    if (!save({invalidateDerived:false, dirtyViews:['settings']})) { renderAll(); return; }
    renderNotificationSettings();
  }

  function renderNotificationSettings() {
    const prefs = notificationPrefs();
    const master = el('notificationMasterToggle');
    if (!master) return;
    master.checked = prefs.enabled;
    master.disabled = !nativeNotificationsSupported();
    el('notificationTargetToggle').checked = prefs.targetReached;
    el('notificationBackupToggle').checked = prefs.backupDue;
    el('notificationSafetyToggle').checked = prefs.longFastSafety;
    el('notificationWeighToggle').checked = prefs.weighIn;
    el('notificationCycleToggle').checked = prefs.cycleComplete;
    renderWeighCadenceButtons('notification', prefs.weighInCadence);
    const permission = notificationPermissionState();
    const badge = el('notificationPermissionBadge');
    badge.textContent = t(permission === 'granted' && prefs.enabled ? 'notifications.badgeOn' : permission === 'denied' ? 'notifications.badgeBlocked' : permission === 'unsupported' ? 'notifications.badgeUnavailable' : 'notifications.badgeOff');
    el('notificationStatusText').textContent = t(notificationStatusKey());
    const blockedHelp = el('notificationBlockedHelp');
    if (blockedHelp) blockedHelp.hidden = permission !== 'denied';
    el('notificationTestBtn').disabled = !(prefs.enabled && permission === 'granted');
  }

  async function setNotificationMasterEnabled(wantEnabled) {
    const prefs = notificationPrefs();
    if (!wantEnabled) {
      prefs.enabled = false;
      save({invalidateDerived:false, dirtyViews:['settings']});
      renderNotificationSettings();
      return;
    }
    if (!nativeNotificationsSupported()) { prefs.enabled = false; renderNotificationSettings(); return; }
    let permission = Notification.permission;
    if (permission === 'default') {
      try { permission = await Notification.requestPermission(); } catch { permission = Notification.permission || 'denied'; }
    }
    prefs.enabled = permission === 'granted';
    if (prefs.enabled && !validDate(notificationRuntimeState.enabledAt)) { notificationRuntimeState.enabledAt = new Date().toISOString(); saveNotificationRuntimeState(); }
    if (!save({invalidateDerived:false, dirtyViews:['settings']})) { renderAll(); return; }
    renderNotificationSettings();
    if (prefs.enabled) { checkFastNotifications(); checkMaintenanceNotifications(); }
  }

  function saveNotificationOption(key, value) {
    const prefs = notificationPrefs();
    prefs[key] = value;
    if (key === 'weighIn' && value && !validDate(notificationRuntimeState.weighInAnchorAt)) { notificationRuntimeState.weighInAnchorAt = new Date().toISOString(); saveNotificationRuntimeState(); }
    if (!save({invalidateDerived:false, dirtyViews:['settings']})) { renderAll(); return false; }
    renderNotificationSettings();
    return true;
  }

  async function sendTestNotification() {
    if (!notificationPrefs().enabled || notificationPermissionState() !== 'granted') { renderNotificationSettings(); return; }
    await sendDeviceNotification('test', t('notifications.testTitle'), t('notifications.testBodyShort'), {screen:'settings',tag:'fasting-tracker-test'});
  }

