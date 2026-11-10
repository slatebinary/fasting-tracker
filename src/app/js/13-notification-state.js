  function normalizeNotificationPreferences(raw) {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      enabled: value.enabled === true,
      targetReached: value.targetReached !== false,
      backupDue: value.backupDue !== false,
      longFastSafety: value.longFastSafety !== false,
      weighIn: value.weighIn === true,
      weighInCadence: value.weighInCadence === 'daily' ? 'daily' : 'weekly',
      cycleComplete: value.cycleComplete === true
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

  function recordNotificationDetail(kind, {screen='fasting', tag=null, params={}} = {}) {
    const id = String(tag || `fasting-tracker-${kind}-${Date.now()}`);
    const current = notificationDetailItems().filter(item => item.id !== id);
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
    const items = notificationDetailItems(); stack.replaceChildren(); stack.hidden = items.length === 0;
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
      const dismiss=document.createElement('button'); dismiss.type='button'; dismiss.className='secondary notificationDetailDismiss'; dismiss.textContent=t('common.dismiss'); dismiss.setAttribute('aria-label',t('notifications.detailsDismissAria',{title:copy.title})); dismiss.addEventListener('click',()=>dismissNotificationDetail(item.id));
      actions.append(dismiss);
      header.append(heading,actions);
      const body=document.createElement('div'); body.className='notificationDetailBody'; body.textContent=copy.body;
      card.append(header,body); stack.append(card);
    }
  }
