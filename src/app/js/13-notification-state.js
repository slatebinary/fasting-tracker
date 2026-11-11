  function normalizeNotificationPreferences(raw) {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      enabled: value.enabled === true,
      targetReached: value.targetReached !== false,
      backupDue: value.backupDue !== false,
      longFastSafety: value.longFastSafety !== false,
      weighIn: value.weighIn === true,
      weighInCadence: value.weighInCadence === 'daily' ? 'daily' : 'weekly',
      cycleComplete: value.cycleComplete === true,
      weightSnoozeMinutes: [15,30,60,240,480,720,1440,2880,4320,10080].includes(Number(value.weightSnoozeMinutes)) ? Number(value.weightSnoozeMinutes) : 1440,
      fastingSnoozeMinutes: [15,30,60,240,480,720,1440,2880,4320,10080].includes(Number(value.fastingSnoozeMinutes)) ? Number(value.fastingSnoozeMinutes) : 60
    };
  }

  function loadNotificationRuntimeState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_STATE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  }

  function saveNotificationRuntimeState() {
    try { localStorage.setItem(NOTIFICATION_STATE_KEY, JSON.stringify(notificationRuntimeState)); } catch {}
  }

  function normalizeNotificationDetailItems(raw) {
    const now = Date.now();
    const items = Array.isArray(raw) ? raw : [];
    const seen = new Set(), out = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const id = String(item.id || '').slice(0, 240);
      const kind = String(item.kind || '').slice(0, 40);
      const screen = APP_SCREENS.includes(item.screen) ? item.screen : 'fasting';
      const created = validDate(item.createdAt);
      if (!id || !kind || !created || now - created.getTime() > NOTIFICATION_DETAIL_TTL_MS || seen.has(id)) continue;
      const params = item.params && typeof item.params === 'object' && !Array.isArray(item.params) ? item.params : {};
      seen.add(id); out.push({id, kind, screen, createdAt:created.toISOString(), params});
      if (out.length >= NOTIFICATION_DETAIL_LIMIT) break;
    }
    return out;
  }

  function notificationDetailCopy(kind, params = {}) {
    if (kind === 'target') return {title:t('notifications.targetTitle'), body:t('notifications.targetDetails',{target:formatGoal(sanitizeGoal(params.targetHours, activeTargetHours()))})};
    if (kind === 'backup') return {title:t('notifications.backupTitle'), body:t('notifications.backupDetails')};
    if (kind === 'safety') return {title:t('notifications.safetyTitle'), body:t('notifications.safetyDetails')};
    if (kind === 'weigh-in') {
      const cadenceKey = params.cadence === 'daily' ? 'notifications.daily' : 'notifications.weekly';
      return {title:t('notifications.weighTitle'), body:t('notifications.weighDetails',{cadence:t(cadenceKey).toLowerCase()})};
    }
    if (kind === 'cycle') return {title:t('notifications.cycleTitle'), body:t('notifications.cycleDetails')};
    if (kind === 'test') return {title:t('notifications.testTitle'), body:t('notifications.testDetails')};
    return {title:t('notifications.detailsHeading'), body:t('notifications.detailsFallback')};
  }

  function notificationDetailItems() {
    const clean = normalizeNotificationDetailItems(notificationRuntimeState.details);
    if (JSON.stringify(clean) !== JSON.stringify(notificationRuntimeState.details || [])) {
      notificationRuntimeState.details = clean; saveNotificationRuntimeState();
    }
    return clean;
  }

  const NOTIFICATION_SNOOZE_MINUTES = Object.freeze([15,30,60,240,480,720,1440,2880,4320,10080]);
  function notificationSnoozeCategory(kind) {
    if (kind === 'weigh-in') return 'weight';
    return ['target','safety','cycle'].includes(kind) ? 'fasting' : null;
  }
  function notificationSnoozeDefaultMinutes(kind) {
    const prefs = notificationPrefs();
    return notificationSnoozeCategory(kind) === 'weight' ? prefs.weightSnoozeMinutes : prefs.fastingSnoozeMinutes;
  }
  function notificationSnoozeDurationLabel(minutes) {
    if (minutes < 60) return `${minutes} ${t(pluralKey('unit.minute', minutes))}`;
    if (minutes < 1440) { const count = minutes / 60; return `${formatNumber(count)} ${t(pluralKey('unit.hour', count))}`; }
    const count = minutes / 1440;
    return `${formatNumber(count)} ${t(pluralKey('unit.day', count))}`;
  }
  function snoozeNotificationDetail(id, durationMinutes) {
    const duration = Number(durationMinutes);
    if (!NOTIFICATION_SNOOZE_MINUTES.includes(duration)) return false;
    const item = notificationDetailItems().find(entry => entry.id === id);
    if (!item || !notificationSnoozeCategory(item.kind)) return false;
    const until = Date.now() + duration * 60000;
    notificationRuntimeState.details = notificationDetailItems().filter(entry => entry.id !== id);
    const pending = Array.isArray(notificationRuntimeState.snoozedDetails) ? notificationRuntimeState.snoozedDetails : [];
    notificationRuntimeState.snoozedDetails = [{...item, snoozedUntil:new Date(until).toISOString()}, ...pending.filter(entry => entry?.id !== id)].slice(0, NOTIFICATION_DETAIL_LIMIT);
    saveNotificationRuntimeState();
    renderNotificationDetails();
    return true;
  }
  function restoreDueSnoozedNotificationDetails(nowMs = Date.now()) {
    const pending = Array.isArray(notificationRuntimeState.snoozedDetails) ? notificationRuntimeState.snoozedDetails : [];
    const due = [], remaining = [];
    for (const item of pending) {
      const until = validDate(item?.snoozedUntil);
      if (!item || typeof item !== 'object' || !String(item.id || '') || !until) continue;
      if (until.getTime() <= nowMs) due.push(item);
      else remaining.push(item);
    }
    if (!due.length) return false;
    const active = notificationDetailItems();
    for (const item of due) {
      if (active.some(entry => entry.id === item.id)) continue;
      const snoozedUntilMs = validDate(item.snoozedUntil)?.getTime() || nowMs;
      const restored = {id:String(item.id),kind:String(item.kind),screen:APP_SCREENS.includes(item.screen)?item.screen:'fasting',createdAt:new Date(nowMs).toISOString(),params:item.params&&typeof item.params==='object'?item.params:{}};
      active.unshift(restored);
      const copy = notificationDetailCopy(restored.kind, restored.params);
      let deviceBody = copy.body;
      if (restored.kind === 'target') deviceBody = t('notifications.targetBodyShort',{target:formatGoal(sanitizeGoal(restored.params.targetHours,activeTargetHours()))});
      else if (restored.kind === 'safety') deviceBody = t('notifications.safetyBodyShort');
      else if (restored.kind === 'cycle') deviceBody = t('notifications.cycleBodyShort');
      else if (restored.kind === 'weigh-in') {
        const cadenceKey = restored.params.cadence === 'daily' ? 'notifications.daily' : 'notifications.weekly';
        deviceBody = t('notifications.weighBodyShort',{cadence:t(cadenceKey).toLowerCase()});
      }
      void sendDeviceNotification(restored.kind, copy.title, deviceBody, {screen:restored.screen,tag:restored.id,detailParams:restored.params,recordDetail:false});
    }
    notificationRuntimeState.snoozedDetails = remaining;
    notificationRuntimeState.details = active.slice(0, NOTIFICATION_DETAIL_LIMIT);
    saveNotificationRuntimeState();
    return true;
  }

  function recordNotificationDetail(kind, {screen='fasting', tag=null, params={}} = {}) {
    const id = String(tag || `fasting-tracker-${kind}-${Date.now()}`);
    const current = notificationDetailItems().filter(item => item.id !== id);
    notificationRuntimeState.snoozedDetails = (Array.isArray(notificationRuntimeState.snoozedDetails) ? notificationRuntimeState.snoozedDetails : []).filter(item => item?.id !== id);
    notificationRuntimeState.details = [{id, kind, screen:APP_SCREENS.includes(screen)?screen:'fasting', createdAt:new Date().toISOString(), params}, ...current].slice(0, NOTIFICATION_DETAIL_LIMIT);
    saveNotificationRuntimeState();
    renderNotificationDetails();
  }

  function dismissNotificationDetail(id) {
    notificationRuntimeState.details = notificationDetailItems().filter(item => item.id !== id);
    saveNotificationRuntimeState(); renderNotificationDetails();
  }

  function renderNotificationDetails() {
    const stack = el('notificationDetailStack'); if (!stack) return;
    restoreDueSnoozedNotificationDetails();
    const items = notificationDetailItems(); stack.replaceChildren();
    for (const item of items) {
      const copy = notificationDetailCopy(item.kind, item.params);
      const card = document.createElement('div'); card.className='card notificationDetailCard'; card.setAttribute('role','status'); card.dataset.notificationDetailId=item.id;
      const header=document.createElement('div'); header.className='notificationDetailHeader';
      const heading=document.createElement('div');
      const title=document.createElement('div'); title.className='notificationDetailTitle'; title.textContent=copy.title;
      const time=document.createElement('div'); time.className='small notificationDetailTime'; time.textContent=t('notifications.detailsReceived',{date:localDateTimeLabel(item.createdAt)});
      heading.append(title,time);
      const actions=document.createElement('div'); actions.className='notificationDetailActions';
      if (item.kind === 'weigh-in') {
        const add=document.createElement('button'); add.type='button'; add.className='primary notificationDetailAddWeight'; add.textContent=t('notifications.addWeightAction'); add.setAttribute('aria-label',t('notifications.addWeightAria')); add.addEventListener('click',()=>{ openWeightModal(); dismissNotificationDetail(item.id); });
        actions.append(add);
      }
      if (notificationSnoozeCategory(item.kind)) {
        const duration=document.createElement('select'); duration.className='notificationDetailSnoozeDuration'; duration.setAttribute('aria-label',t('notifications.snoozeDurationAria',{title:copy.title}));
        for (const minutes of NOTIFICATION_SNOOZE_MINUTES) { const option=document.createElement('option'); option.value=String(minutes); option.textContent=notificationSnoozeDurationLabel(minutes); duration.append(option); }
        duration.value=String(notificationSnoozeDefaultMinutes(item.kind));
        const snooze=document.createElement('button'); snooze.type='button'; snooze.className='secondary notificationDetailSnooze'; snooze.textContent=t('notifications.snoozeAction'); snooze.setAttribute('aria-label',t('notifications.detailsSnoozeAria',{title:copy.title}));
        snooze.addEventListener('click',()=>snoozeNotificationDetail(item.id,duration.value));
        actions.append(duration,snooze);
      }
      const dismiss=document.createElement('button'); dismiss.type='button'; dismiss.className='secondary notificationDetailDismiss'; dismiss.textContent=t('common.dismiss'); dismiss.setAttribute('aria-label',t('notifications.detailsDismissAria',{title:copy.title})); dismiss.addEventListener('click',()=>dismissNotificationDetail(item.id));
      actions.append(dismiss);
      header.append(heading,actions);
      const body=document.createElement('div'); body.className='notificationDetailBody'; body.textContent=copy.body;
      card.append(header,body); stack.append(card);
    }
  }
