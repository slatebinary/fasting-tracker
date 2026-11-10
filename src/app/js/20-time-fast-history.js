  function exactDuration(ms) {
    ms = Math.max(0, ms);
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function friendlyDuration(ms, includeMinutes = true) {
    ms = Math.max(0, ms);
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const minutes = totalMin % 60;
    if (days > 0) return `${formatNumber(days)} ${t(pluralKey('unit.day', days))} ${formatNumber(hours)}${t('unit.h')}${includeMinutes ? ` ${formatNumber(minutes)}${t('unit.m')}` : ''}`;
    if (hours > 0) return `${formatNumber(hours)}${t('unit.h')}${includeMinutes ? ` ${formatNumber(minutes)}${t('unit.m')}` : ''}`;
    return `${formatNumber(minutes)}${t('unit.m')}`;
  }

  function compactDuration(ms) {
    ms = Math.max(0, ms);
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const minutes = totalMin % 60;
    if (days > 0) return `${formatNumber(days)}${t('unit.d')} ${formatNumber(hours)}${t('unit.h')} ${formatNumber(minutes)}${t('unit.m')}`;
    if (hours > 0) return `${formatNumber(hours)}${t('unit.h')} ${formatNumber(minutes)}${t('unit.m')}`;
    return `${formatNumber(minutes)}${t('unit.m')}`;
  }

  function totalHoursDuration(ms) {
    ms = Math.max(0, ms);
    const totalMin = Math.floor(ms / 60000);
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    return `${formatNumber(hours)}${t('unit.h')} ${formatNumber(minutes)}${t('unit.m')}`;
  }

  function dayKey(dateLike, timeZone = currentTimeZone()) {
    return timeUtils.dayKey(dateLike, timeZone);
  }

  function dayKeyFast(dateLike, timeZone = currentTimeZone()) {
    return timeUtils.dayKeyFast(dateLike, timeZone);
  }

  function weekKeyFromDayString(dayString) {
    return timeUtils.weekKeyFromDayString(dayString);
  }

  function weightCalendarDay(weight) {
    if (weight && typeof weight.calendarDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weight.calendarDay)) return weight.calendarDay;
    return weight ? dayKeyFast(weight.when, weight.timeZone || currentTimeZone()) : '';
  }

  function localDateLabel(dateLike, timeZone = null) {
    return timeUtils.localDateLabel(dateLike, timeZone);
  }

  function localDateTimeLabel(dateLike, timeZone = null) {
    return timeUtils.localDateTimeLabel(dateLike, timeZone);
  }

  function localTimeLabel(dateLike, timeZone = null) {
    return timeUtils.localTimeLabel(dateLike, timeZone);
  }

  function nextZonedDayBoundary(ms, timeZone, knownKey = null) {
    return timeUtils.nextZonedDayBoundary(ms, timeZone, knownKey);
  }

  function addIntervalToDayMap(map, startLike, endLike, timeZone) {
    return timeUtils.addIntervalToDayMap(map, startLike, endLike, timeZone);
  }

  function completedFastingByStoredCalendarDay() {
    return storedDayTotalsMap;
  }
  function fastingByStoredCalendarDay() {
    const map = new Map(completedFastingByStoredCalendarDay());
    if (data.activeStart) addIntervalToDayMap(map, data.activeStart, new Date(), data.activeTimeZone || currentTimeZone());
    return map;
  }

  function recordMs(r) { return Math.max(0, new Date(r.end) - new Date(r.start)); }
  function goalMs(hours = data.goalHours) { return sanitizeGoal(hours, data.goalHours) * 3600000; }
  function recordMetGoal(r) { return recordMs(r) >= goalMs(r.goalHours ?? data.goalHours); }
  function activeTargetHours() { return data.activeStart ? sanitizeGoal(data.activeGoalHours, data.goalHours) : data.goalHours; }

  function fastingMsForDay(dayDate) {
    const key = dayKey(dayDate, currentTimeZone());
    let total = completedFastingByStoredCalendarDay().get(key) || 0;
    if (data.activeStart) {
      const active = new Map();
      addIntervalToDayMap(active, data.activeStart, new Date(), data.activeTimeZone || currentTimeZone());
      total += active.get(key) || 0;
    }
    return total;
  }

  function updateGoalChips() {
    document.querySelectorAll('.chip[data-goal]').forEach(chip => {
      const active = Number(chip.dataset.goal) === data.goalHours; chip.classList.toggle('active', active); chip.setAttribute('aria-pressed', String(active));
    });
    updateCycleHelpers();
  }


  function cycleHelperText(hours) {
    const target = sanitizeGoal(hours, data.goalHours);
    if (target < 24) {
      const nonFastingMs = Math.max(0, (24 - target) * 3600000);
      return t('settings.cycleUnder24', {fast: formatGoal(target), nonfast: friendlyDuration(nonFastingMs)});
    }
    if (target === 24) return t('settings.cycle24');
    return t('settings.cycleExtended');
  }

  function updateCycleHelpers() {
    const goalHelp = el('goalCycleHelp');
    if (goalHelp) goalHelp.textContent = cycleHelperText(data.goalHours);
    const activeHelp = el('activeGoalCycleHelp');
    if (activeHelp) {
      const parsed = parseLocalizedNumber(el('activeTargetInput')?.value);
      activeHelp.textContent = cycleHelperText(Number.isFinite(parsed) && parsed > 0 ? parsed : activeTargetHours());
    }
  }

  function latestCompletedFast() {
    if (latestCompletedFastCache !== undefined) return latestCompletedFastCache;
    let latest = null, latestEnd = -Infinity;
    for (const record of data.records) {
      const endMs = new Date(record.end).getTime();
      if (Number.isFinite(endMs) && endMs > latestEnd) { latest = record; latestEnd = endMs; }
    }
    latestCompletedFastCache = latest;
    return latest;
  }

  function nextFastCycleInfo(nowMs = Date.now()) {
    if (data.activeStart) return null;
    const record = latestCompletedFast();
    if (!record) return null;
    const startMs = new Date(record.start).getTime(), endMs = new Date(record.end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
    const durationMs = endMs - startMs;
    const dayMs = 24 * 3600000;
    if (durationMs >= dayMs) return null;
    const suggestedStartMs = startMs + dayMs;
    const remainingMs = suggestedStartMs - nowMs;
    if (remainingMs <= 0) return null;
    return { record, durationMs, nonFastingMs: dayMs - durationMs, suggestedStartMs, remainingMs };
  }

  function updateNextFastCountdown() {
    const card = el('nextFastCard');
    if (!card) return;
    const info = nextFastCycleInfo();
    card.hidden = !info;
    if (!info) return;
    el('nextFastCountdown').textContent = exactDuration(info.remainingMs);
    el('nextFastAt').textContent = t('fasting.nextAt', {date: localDateTimeLabel(info.suggestedStartMs, info.record.timeZone)});
    // Derive both displayed parts from the same completed whole-minute value so
    // the visible arithmetic always adds up to exactly 24h. The countdown itself
    // remains second-accurate.
    const fastMinutes = Math.max(0, Math.min(1439, Math.floor(info.durationMs / 60000)));
    const nonFastMinutes = 1440 - fastMinutes;
    el('nextFastBasis').textContent = t('fasting.nextBasis', {
      fasted: totalHoursDuration(fastMinutes * 60000),
      nonfast: totalHoursDuration(nonFastMinutes * 60000)
    });
  }

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

  async function maybeNotifyWeighIn(nowMs = Date.now()) {
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
    const cadence = t(prefs.weighInCadence === 'daily' ? 'notifications.daily' : 'notifications.weekly').toLowerCase();
    const sent = await sendDeviceNotification('weigh-in', t('notifications.weighTitle'), t('notifications.weighBodyShort', {cadence}), {screen:'weight',tag:`fasting-weigh-${token}`,detailParams:{cadence:prefs.weighInCadence}});
    if (sent) { notificationRuntimeState.weighInToken = token; saveNotificationRuntimeState(); }
    return sent;
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

  const SCIENCE_STAGES = [
    { max: 8, key: 0 }, { max: 12, key: 1 }, { max: 24, key: 2 },
    { max: 36, key: 3 }, { max: 48, key: 4 }, { max: Infinity, key: 5 }
  ];

  function updateScienceCard() {
    const stages = [...document.querySelectorAll('.scienceStage')];
    stages.forEach(x => x.classList.remove('current'));
    if (!data.activeStart) {
      el('scienceWindow').textContent = t('science.notFasting');
      el('scienceEvidence').textContent = t('science.limited');
      el('scienceText').textContent = t('science.idle');
      return;
    }
    const startMs = new Date(data.activeStart).getTime();
    const hours = Math.max(0, (Date.now() - startMs) / 3600000);
    let index = SCIENCE_STAGES.findIndex(stage => hours < stage.max);
    if (index < 0) index = SCIENCE_STAGES.length - 1;
    const stage = SCIENCE_STAGES[index];
    el('scienceWindow').textContent = t(`science.stage${stage.key}`);
    el('scienceEvidence').textContent = t(`science.stage${stage.key}e`);
    el('scienceText').textContent = t(`science.stage${stage.key}t`);
    if (stages[index]) stages[index].classList.add('current');
  }

  function updateTimer() {
    const targetHours = activeTargetHours();
    goalText.textContent = data.activeStart ? t('fasting.targetLocked', {goal: formatGoal(targetHours)}) : t('fasting.target', {goal: formatGoal(data.goalHours)});
    if (document.activeElement !== goalHours) goalHours.value = formatNumber(data.goalHours, 0, 3);
    updateGoalChips();

    if (data.activeStart) {
      el('nextFastCard').hidden = true;
      const startMs = new Date(data.activeStart).getTime();
      const elapsed = Math.max(0, Date.now() - startMs);
      const targetMs = goalMs(targetHours);
      const pct = targetMs > 0 ? (elapsed / targetMs) * 100 : 0;
      timer.textContent = exactDuration(elapsed);
      friendlyTimer.textContent = friendlyDuration(elapsed);
      statusText.textContent = t('fasting.started', {date: localDateTimeLabel(data.activeStart, data.activeTimeZone)});
      toggleFast.textContent = t('fasting.stop');
      toggleFast.classList.add('stop');
      startEarlierBtn.hidden = true;
      editActiveTargetBtn.hidden = false;
      const visualPct = Math.min(100, Math.max(0, pct));
      fastProgressTrack.style.setProperty('--fast-progress-angle', `${visualPct * 3.6}deg`);
      fastProgressTrack.classList.toggle('reached', pct >= 100);
      fastProgressTrack.setAttribute('aria-valuenow', String(Math.round(visualPct)));
      fastProgressTrack.setAttribute('aria-valuetext', pct >= 100 ? t('fasting.targetReached', {duration:friendlyDuration(Math.max(0, elapsed - targetMs))}) : t('fasting.progress', {pct:formatNumber(Math.min(99.9, pct), pct < 10 ? 1 : 0, pct < 10 ? 1 : 0), duration:friendlyDuration(Math.max(0, targetMs - elapsed))}));
      const targetMoment = el('targetMoment');
      const targetAt = safeTargetDate(startMs, targetMs);
      targetMoment.hidden = !targetAt;
      if (targetAt) targetMoment.textContent = elapsed >= targetMs
        ? t('fasting.targetTimePassed', {date: localDateTimeLabel(targetAt, data.activeTimeZone)})
        : t('fasting.expectedTargetTime', {date: localDateTimeLabel(targetAt, data.activeTimeZone)});

      const encouragement = el('fastingEncouragement');
      const shorterState = shorterGoalState();
      if (shorterState?.start === data.activeStart && shorterState.checkpointAt > 0) {
        encouragement.hidden = false;
        encouragement.textContent = Date.now() < shorterState.checkpointAt
          ? t('fasting.shorterCheckpoint', {duration:friendlyDuration(shorterState.checkpointAt - Date.now())})
          : t('fasting.shorterCheckpointReached');
      } else if (elapsed >= targetMs) {
        encouragement.hidden = false;
        encouragement.textContent = t('fasting.encourageComplete');
      } else {
        const remainingForEncouragement = targetMs - elapsed;
        const progressForEncouragement = targetMs > 0 ? elapsed / targetMs : 0;
        const encouragementKey = progressForEncouragement < 0.25 ? 'fasting.encourageEarly' : progressForEncouragement < 0.75 ? 'fasting.encourageMiddle' : progressForEncouragement < 0.95 ? 'fasting.encourageNear' : 'fasting.encourageAlmost';
        encouragement.hidden = false;
        encouragement.textContent = t(encouragementKey, {duration:friendlyDuration(remainingForEncouragement)});
      }

      if (elapsed >= targetMs) {
        const beyond = elapsed - targetMs;
        progressDetail.textContent = t('fasting.targetReached', {duration: friendlyDuration(beyond)});
        progressDetail.classList.add('good');
      } else {
        const remaining = targetMs - elapsed;
        progressDetail.textContent = t('fasting.progress', {pct: formatNumber(Math.min(99.9, pct), pct < 10 ? 1 : 0, pct < 10 ? 1 : 0), duration: friendlyDuration(remaining)});
        progressDetail.classList.remove('good');
      }
    } else {
      timer.textContent = '00:00:00';
      friendlyTimer.textContent = `0${t('unit.h')} 0${t('unit.m')}`;
      statusText.textContent = t('fasting.ready');
      toggleFast.textContent = t('fasting.start');
      toggleFast.classList.remove('stop');
      startEarlierBtn.hidden = false;
      editActiveTargetBtn.hidden = true;
      fastProgressTrack.style.setProperty('--fast-progress-angle', '0deg');
      fastProgressTrack.classList.remove('reached');
      fastProgressTrack.setAttribute('aria-valuenow', '0');
      fastProgressTrack.setAttribute('aria-valuetext', t('fasting.zeroProgress'));
      progressDetail.textContent = t('fasting.zeroProgress');
      progressDetail.classList.remove('good');
      el('fastingEncouragement').hidden = true;
      el('fastingEncouragement').textContent = '';
      el('targetMoment').hidden = true;
      el('targetMoment').textContent = '';
      updateNextFastCountdown();
    }

    updateScienceCard();
    updateToday();
  }

  function startFast() {
    clearShorterGoalState();
    const createdAt = new Date().toISOString();
    data.activeStart = createdAt;
    data.activeGoalHours = data.goalHours;
    data.activeTimeZone = currentTimeZone();
    data.activeCreatedAt = createdAt;
    data.activeModifiedAt = null;
    if (!save()) { renderAll(); return; }
    renderAll();
  }

  function clearStopUndo({ hide = true } = {}) {
    pendingStopUndo = null;
    if (stopUndoTimer) { clearTimeout(stopUndoTimer); stopUndoTimer = 0; }
    if (stopUndoCountdownTimer) { clearInterval(stopUndoCountdownTimer); stopUndoCountdownTimer = 0; }
    if (stopUndoMessageTimer) { clearTimeout(stopUndoMessageTimer); stopUndoMessageTimer = 0; }
    if (hide) el('stopUndoBar').hidden = true;
  }

  function updateStopUndoCountdown() {
    const badge = el('stopUndoCountdown');
    if (!badge || !pendingStopUndo) return;
    const seconds = Math.max(0, Math.ceil((pendingStopUndo.expiresAt - Date.now()) / 1000));
    badge.textContent = `${seconds}s`;
  }

  function showStopUndo(recordId, activeSnapshot) {
    clearStopUndo({hide:false});
    pendingStopUndo = { recordId, activeSnapshot, expiresAt: Date.now() + 10000 };
    el('stopUndoText').textContent = t('fasting.stoppedUndo');
    el('stopUndoBtn').hidden = false;
    el('stopUndoCountdown').hidden = false;
    el('stopUndoBar').hidden = false;
    updateStopUndoCountdown();
    stopUndoCountdownTimer = setInterval(updateStopUndoCountdown, 250);
    stopUndoTimer = setTimeout(() => clearStopUndo(), 10000);
  }

  function closeStopFastModal() {
    // Do not expose the underlying Start/Stop control to the tail end of the
    // same touch sequence that dismissed this modal. Mobile Safari can
    // otherwise retarget a synthetic click after the overlay disappears.
    suppressFastToggleUntil = performance.now() + 350;
    hideModal('stopFastModal');
    stopModalStage = 'confirm';
    shorterGoalOfferMs = 0;
    el('continueOriginalTargetBtn').hidden = true;
    el('stopFastModalActions').classList.remove('shorterOfferActions');
    el('stopFastModalTitle').textContent = t('fasting.stopModalTitle');
    el('keepFastingBtn').textContent = t('fasting.keepFasting');
    el('stopAndSaveBtn').textContent = t('fasting.stopAndSave');
  }

  function shorterGoalState() {
    try {
      const value = JSON.parse(localStorage.getItem('fastingTracker.shorterGoal') || 'null');
      if (!value || typeof value.start !== 'string' || !Number.isFinite(Number(value.checkpointAt))) return null;
      return {start:value.start, checkpointAt:Number(value.checkpointAt), offered:value.offered === true};
    } catch { return null; }
  }

  function saveShorterGoalState(value) {
    try { localStorage.setItem('fastingTracker.shorterGoal', JSON.stringify(value)); } catch {}
  }

  function clearShorterGoalState() {
    try { localStorage.removeItem('fastingTracker.shorterGoal'); } catch {}
  }

  function keepFastingAndReturnHome() {
    if (stopModalStage === 'shorter') {
      const start = data.activeStart;
      if (start && shorterGoalOfferMs > 0) {
        saveShorterGoalState({start, checkpointAt:Date.now() + shorterGoalOfferMs, offered:true});
      }
    }
    closeStopFastModal();
    activateScreen('fasting');
    requestAnimationFrame(() => { try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch { window.scrollTo(0, 0); } });
  }

  function keepOriginalTargetAndReturnHome() {
    const start = data.activeStart;
    if (start) saveShorterGoalState({start, checkpointAt:0, offered:true, choice:'original-target'});
    closeStopFastModal();
    activateScreen('fasting');
    requestAnimationFrame(() => { try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch { window.scrollTo(0, 0); } });
  }

  function stopFast() {
    const start = validDate(data.activeStart);
    if (!start) {
      data.activeStart = null;
      data.activeGoalHours = null;
      data.activeTimeZone = null;
      data.activeCreatedAt = null;
      data.activeModifiedAt = null;
      if (!save()) { renderAll(); return; }
      renderAll();
      return;
    }
    const duration = Date.now() - start.getTime();
    if (duration <= 0) { alert(t('fasting.clockError')); return; }
    stopModalStage = 'confirm';
    shorterGoalOfferMs = 0;
    el('stopFastModalTitle').textContent = t('fasting.stopModalTitle');
    el('keepFastingBtn').textContent = t('fasting.keepFasting');
    el('stopAndSaveBtn').textContent = t('fasting.stopAndSave');
    const text = el('stopFastModalText');
    text.classList.toggle('warn', duration < 60000);
    text.textContent = duration < 60000
      ? t('fasting.stopModalShort')
      : t('fasting.stopModalText', {duration: friendlyDuration(duration)});
    const early = duration < goalMs(activeTargetHours());
    const reasonGroup = el('stopReasonGroup');
    if (reasonGroup) reasonGroup.hidden = !early;
    if (early && el('stopReasonSelect')) el('stopReasonSelect').value = 'personal';
    showModal('stopFastModal', 'keepFastingBtn');
  }

  function confirmStopFast() {
    if (stopModalStage === 'confirm') {
      const startNow = validDate(data.activeStart);
      if (startNow) {
        const nowMs = Date.now();
        const remainingMs = startNow.getTime() + goalMs(activeTargetHours()) - nowMs;
        const reason = normalizeStopReason(el('stopReasonSelect')?.value);
        // Re-offer on every personal early-stop attempt. The shorter-goal
        // state remains useful for the active checkpoint display, but must
        // never suppress a later stop decision for this same fast.
        if (remainingMs >= 120000 && (!reason || reason === 'personal')) {
          shorterGoalOfferMs = Math.floor((remainingMs / 2) / 60000) * 60000;
          if (shorterGoalOfferMs >= 60000) {
            stopModalStage = 'shorter';
            el('stopFastModalTitle').textContent = t('fasting.shorterOfferTitle');
            el('stopFastModalText').classList.remove('warn');
            el('stopFastModalText').textContent = t('fasting.shorterOfferText', {duration:friendlyDuration(shorterGoalOfferMs)});
            el('stopReasonGroup').hidden = true;
            el('stopFastModalActions').classList.add('shorterOfferActions');
            el('continueOriginalTargetBtn').hidden = false;
            el('continueOriginalTargetBtn').textContent = t('fasting.shorterOfferOriginal');
            el('keepFastingBtn').textContent = t('fasting.shorterOfferContinue', {duration:friendlyDuration(shorterGoalOfferMs)});
            el('stopAndSaveBtn').textContent = t('fasting.shorterOfferStop');
            el('continueOriginalTargetBtn').focus();
            return;
          }
        }
      }
    }
    const start = validDate(data.activeStart);
    if (!start) { closeStopFastModal(); return; }
    const end = new Date();
    const duration = end - start;
    if (duration <= 0) { closeStopFastModal(); alert(t('fasting.clockError')); return; }
    const activeSnapshot = {
      activeStart: start.toISOString(),
      activeGoalHours: activeTargetHours(),
      previousGoalHours: data.goalHours,
      activeTimeZone: data.activeTimeZone || currentTimeZone(),
      activeCreatedAt: normalizeAuditTimestamp(data.activeCreatedAt),
      activeModifiedAt: normalizeAuditTimestamp(data.activeModifiedAt)
    };
    const record = {
      id: makeId(),
      start: activeSnapshot.activeStart,
      end: end.toISOString(),
      goalHours: activeSnapshot.activeGoalHours,
      timeZone: activeSnapshot.activeTimeZone,
      createdAt: activeSnapshot.activeCreatedAt,
      modifiedAt: activeSnapshot.activeModifiedAt,
      stopReason: duration < goalMs(activeSnapshot.activeGoalHours) ? (normalizeStopReason(el('stopReasonSelect')?.value) || 'personal') : null
    };
    data.records.push(record);
    // The target used for the most recently completed fast becomes the default
    // for the next interval. Historical records still keep their own target.
    data.goalHours = activeSnapshot.activeGoalHours;
    data.activeStart = null;
    data.activeGoalHours = null;
    data.activeTimeZone = null;
    data.activeCreatedAt = null;
    data.activeModifiedAt = null;
    if (!save()) {
      data.records = data.records.filter(r => r.id !== record.id);
      data.goalHours = activeSnapshot.previousGoalHours;
      data.activeStart = activeSnapshot.activeStart;
      data.activeGoalHours = activeSnapshot.activeGoalHours;
      data.activeTimeZone = activeSnapshot.activeTimeZone;
      data.activeCreatedAt = activeSnapshot.activeCreatedAt;
      data.activeModifiedAt = activeSnapshot.activeModifiedAt;
      closeStopFastModal();
      renderAll();
      return;
    }
    closeStopFastModal();
    renderAll();
    showStopUndo(record.id, activeSnapshot);
  }

  function undoStoppedFast() {
    const pending = pendingStopUndo;
    if (!pending || Date.now() > pending.expiresAt) { clearStopUndo(); return; }
    if (data.activeStart || !data.records.some(r => r.id === pending.recordId)) {
      clearStopUndo();
      alert(t('fasting.undoUnavailable'));
      return;
    }
    const removed = data.records.find(r => r.id === pending.recordId);
    data.records = data.records.filter(r => r.id !== pending.recordId);
    data.activeStart = pending.activeSnapshot.activeStart;
    data.activeGoalHours = pending.activeSnapshot.activeGoalHours;
    data.activeTimeZone = pending.activeSnapshot.activeTimeZone;
    data.activeCreatedAt = pending.activeSnapshot.activeCreatedAt;
    data.activeModifiedAt = pending.activeSnapshot.activeModifiedAt;
    // Keep the last selected target as the next default even after Undo.
    data.goalHours = pending.activeSnapshot.activeGoalHours;
    if (!save()) {
      data.records.push(removed);
      data.activeStart = null;
      data.activeGoalHours = null;
      data.activeTimeZone = null;
      data.activeCreatedAt = null;
      data.activeModifiedAt = null;
      renderAll();
      return;
    }
    clearStopUndo({hide:false});
    renderAll();
    el('stopUndoText').textContent = t('fasting.undoRestored');
    el('stopUndoBtn').hidden = true;
    el('stopUndoCountdown').hidden = true;
    el('stopUndoBar').hidden = false;
    stopUndoMessageTimer = setTimeout(() => { el('stopUndoBar').hidden = true; stopUndoMessageTimer = 0; }, 2200);
  }

  bindResponsiveAction(toggleFast, () => {
    if (performance.now() < suppressFastToggleUntil) return;
    if (fastActionLocked || recoveryMode) return;
    fastActionLocked = true;
    toggleFast.disabled = true;
    try {
      if (data.activeStart) stopFast();
      else { clearStopUndo(); startFast(); }
    } finally {
      setTimeout(() => {
        fastActionLocked = false;
        toggleFast.disabled = !!recoveryMode;
      }, 300);
    }
  });

  function showActiveTargetError(message) {
    const box = el('activeTargetError');
    box.textContent = message || '';
    box.hidden = !message;
  }

  function syncActiveTargetPresetState() {
    const current = parseLocalizedNumber(el('activeTargetInput').value);
    document.querySelectorAll('[data-active-goal]').forEach(btn => {
      const selected = Number.isFinite(current) && Number(btn.dataset.activeGoal) === current;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
    updateCycleHelpers();
  }

  function openActiveTargetModal() {
    if (!data.activeStart || recoveryMode) return;
    el('activeTargetInput').value = formatNumber(activeTargetHours(), 0, 3);
    showActiveTargetError('');
    syncActiveTargetPresetState();
    showModal('activeTargetModal', 'activeTargetInput');
  }

  function closeActiveTargetModal() {
    showActiveTargetError('');
    hideModal('activeTargetModal');
  }

  function applyActiveGoalValue(value) {
    if (!data.activeStart) return false;
    const next = sanitizeGoal(value, activeTargetHours());
    if (next === activeTargetHours()) { closeActiveTargetModal(); return true; }
    data.activeGoalHours = next;
    data.activeModifiedAt = new Date().toISOString();
    if (!save({ invalidateDerived:false, dirtyViews:['fasting','settings'] })) { renderAll(); return false; }
    closeActiveTargetModal();
    updateTimer();
    viewDirty.fasting = false;
    renderBackupStatus();
    return true;
  }

  function requestActiveGoalChange(value) {
    const parsed = parseLocalizedNumber(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_SAFE_GOAL_HOURS) {
      showActiveTargetError(t('activeTarget.errGoal'));
      return;
    }
    const next = sanitizeGoal(parsed, activeTargetHours());
    if (next >= LONG_FAST_NOTICE_HOURS && !longFastNoticeSeen()) {
      pendingLongFastGoal = next;
      pendingLongFastScope = 'active';
      closeActiveTargetModal();
      el('longFastModalText').textContent = t('safety.longFastText', { goal: formatGoal(next) });
      showModal('longFastModal', 'longFastCancelBtn');
      return;
    }
    applyActiveGoalValue(next);
  }

  function sortedRecordsDesc() {
    if (!sortedRecordsDescCache) sortedRecordsDescCache = [...data.records].sort((a,b)=>String(b.end).localeCompare(String(a.end)));
    return sortedRecordsDescCache;
  }

  function sortedRecordsAsc() {
    if (!sortedRecordsAscCache) sortedRecordsAscCache = [...data.records].sort((a,b)=>String(a.end).localeCompare(String(b.end)));
    return sortedRecordsAscCache;
  }

  function currentStreak() {
    if (currentStreakCache != null) return currentStreakCache;
    const sorted = sortedRecordsDesc();
    let streak = 0;
    for (const r of sorted) {
      if (recordMetGoal(r)) { streak++; continue; }
      if (isExcusedStop(r)) continue;
      break;
    }
    currentStreakCache = streak;
    return streak;
  }

  function updateToday() {
    const now = new Date();
    el('todayTotal').textContent = friendlyDuration(fastingMsForDay(now));
    const s = currentStreak();
    el('streakValue').textContent = t(pluralKey('fasting.fastCount', s), {n:s});
  }

  function clearUndoToast() {
    if (undoToastTimer) clearTimeout(undoToastTimer);
    undoToastTimer = 0; undoToastAction = null;
    const toast=el('undoToast'); if(toast) toast.hidden=true;
  }

  function showUndoToast(message, action) {
    clearUndoToast();
    const toast=el('undoToast'), text=el('undoToastText'); if(!toast||!text)return;
    text.textContent=message; undoToastAction=typeof action==='function'?action:null; toast.hidden=false;
    undoToastTimer=setTimeout(clearUndoToast,UNDO_WINDOW_MS);
  }

  function startOfWeek(dateLike = new Date()) {
    const d = new Date(dateLike);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function weekKey(dateLike, timeZone = currentTimeZone()) {
    const p=zonedParts(dateLike,timeZone); const d=new Date(Date.UTC(p.year,p.month-1,p.day));
    const day=d.getUTCDay(), diff=day===0?-6:1-day; d.setUTCDate(d.getUTCDate()+diff);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  }

  function successfulFastCount() {
    return data.records.filter(recordMetGoal).length;
  }

  function distinctWeightLoggingDays() {
    return new Set(data.weights.map(weightCalendarDay).filter(Boolean)).size;
  }

  function gamificationXP() {
    return successfulFastCount() * 10 + distinctWeightLoggingDays() * 2;
  }

  function levelForXP(xp) {
    if (xp >= 350) return { number: 4, nameKey: 'game.level4', min: 350, next: null };
    if (xp >= 150) return { number: 3, nameKey: 'game.level3', min: 150, next: 350 };
    if (xp >= 50) return { number: 2, nameKey: 'game.level2', min: 50, next: 150 };
    return { number: 1, nameKey: 'game.level1', min: 0, next: 50 };
  }

  function weeklyTargetSuccessRate() {
    const currentWeek = weekKey(new Date(), currentTimeZone());
    let total=0, reached=0;
    // Only the current week matters. Scan newest-first and stop once records are
    // clearly older than the week rather than converting a lifetime of dates.
    const sorted=sortedRecordsDesc();
    for(const r of sorted){
      const day=dayKeyFast(r.end,r.timeZone||currentTimeZone());
      const wk=weekKeyFromDayString(day);
      if(wk===currentWeek){ total++; if(recordMetGoal(r)) reached++; continue; }
      // Records are newest-first. Once we are older than the current week,
      // no later record in this loop can belong to the current week.
      if(wk && wk<currentWeek) break;
    }
    return total ? Math.round((reached/total)*100) : null;
  }

