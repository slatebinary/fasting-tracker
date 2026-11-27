  function showBackdateError(message) {
    const box = el('backdateError');
    box.textContent = message || '';
    box.hidden = !message;
  }

  function clearBackdateConflict() {
    backdateConflictRecords = [];
    el('backdateConflict').hidden = true;
    el('backdateConflictList').replaceChildren();
    el('backdateStartBtn').hidden = false;
  }

  function backdateConflicts(start, end = new Date()) {
    const s = start.getTime(), e = end.getTime();
    return data.records.filter(r => {
      const rs = new Date(r.start).getTime(), re = new Date(r.end).getTime();
      return s < re && e > rs;
    }).sort((a,b) => new Date(a.end) - new Date(b.end));
  }

  function renderBackdateConflict(conflicts) {
    backdateConflictRecords = conflicts;
    const panel = el('backdateConflict');
    const list = el('backdateConflictList');
    list.replaceChildren();
    if (!conflicts.length) { clearBackdateConflict(); return; }

    el('backdateConflictTitle').textContent = conflicts.length === 1
      ? t('backdate.conflictTitle')
      : t('backdate.conflictTitleMany', {n: conflicts.length});

    for (const r of conflicts) {
      const line = document.createElement('div');
      line.className = 'small';
      line.textContent = t('backdate.conflictLine', {
        start: localDateTimeLabel(r.start, r.timeZone),
        end: localDateTimeLabel(r.end, r.timeZone),
        duration: friendlyDuration(recordMs(r))
      });
      list.append(line);
    }

    const latest = conflicts[conflicts.length - 1];
    const latestEnd = new Date(latest.end);
    el('backdateConflictHint').textContent = t('backdate.conflictHint', {time: localDateTimeLabel(latest.end, latest.timeZone)});
    el('backdateAdjustBtn').textContent = t('backdate.startAfter', {time: localTimeLabel(latestEnd, latest.timeZone)});
    el('backdateEditConflictBtn').hidden = conflicts.length !== 1;
    el('backdateDeleteConflictBtn').hidden = conflicts.length !== 1;
    el('backdateStartBtn').hidden = true;
    panel.hidden = false;
  }

  function setBackdatePreset(value, unit = 'hours') {
    const amount = Number(value);
    const delta = amount * (unit === 'minutes' ? 60000 : 3600000);
    const d = new Date(Date.now() - delta);
    el('backdateStart').value = toLocalInputValue(d, currentTimeZone());
    showBackdateError('');
    clearBackdateConflict();
  }

  function openBackdateModal() {
    if (data.activeStart || recoveryMode) return;
    const suggested = new Date(Date.now() - 3 * 3600000);
    el('backdateStart').value = toLocalInputValue(suggested, currentTimeZone());
    el('backdateTargetSummary').textContent = t('backdate.target', {goal: formatGoal(data.goalHours)});
    showBackdateError('');
    clearBackdateConflict();
    showModal('backdateModal', 'backdateStart');
  }

  function closeBackdateModal() {
    showBackdateError('');
    clearBackdateConflict();
    hideModal('backdateModal');
  }

  function saveBackdatedActiveFast() {
    if (data.activeStart) { closeBackdateModal(); return; }
    const tz = currentTimeZone();
    const start = zonedLocalToDate(el('backdateStart').value, tz);
    if (!start) { showBackdateError(t('backdate.errStart')); clearBackdateConflict(); return; }
    if (start.getTime() > Date.now() + FUTURE_TOLERANCE_MS) { showBackdateError(t('backdate.errFuture')); clearBackdateConflict(); return; }
    const conflicts = backdateConflicts(start, new Date());
    if (conflicts.length) { showBackdateError(''); renderBackdateConflict(conflicts); return; }
    data.activeStart = start.toISOString();
    data.activeGoalHours = data.goalHours;
    data.activeTimeZone = tz;
    data.activeCreatedAt = new Date().toISOString();
    data.activeModifiedAt = null;
    if (!save()) { renderAll(); return; }
    closeBackdateModal();
    renderAll();
  }


  let pendingEditFastStart = null;

  function syncEditFastPresetState() {
    const goal = parseLocalizedNumber(el('editActiveFastGoal').value);
    document.querySelectorAll('[data-edit-goal]').forEach(btn => {
      const selected = Number.isFinite(goal) && Number(btn.dataset.editGoal) === goal;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
  }

  function syncEditFastStartPresetState() {
    const current = el('editActiveFastStart').value;
    const zone = data.activeTimeZone || currentTimeZone();
    document.querySelectorAll('[data-edit-start-minutes], [data-edit-start-hours]').forEach(btn => {
      const minutes = btn.dataset.editStartMinutes;
      const hours = btn.dataset.editStartHours;
      const delta = minutes !== undefined ? Number(minutes) * 60000 : Number(hours) * 3600000;
      const presetValue = toLocalInputValue(new Date(Date.now() - delta), zone);
      const selected = current === presetValue;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
  }

  function setEditFastStartAgo(value, unit = 'hours') {
    const amount = Number(value);
    const delta = amount * (unit === 'minutes' ? 60000 : 3600000);
    const start = new Date(Date.now() - delta);
    el('editActiveFastStart').value = toLocalInputValue(start, data.activeTimeZone || currentTimeZone());
    syncEditFastStartPresetState();
    el('editActiveFastError').hidden = true;
  }

  function openEditActiveFastModal() {
    if (!data.activeStart || recoveryMode) return;
    el('editActiveFastStart').value=toLocalInputValue(new Date(data.activeStart),data.activeTimeZone||currentTimeZone());
    el('editActiveFastGoal').value=String(activeTargetHours());
    el('editActiveFastZone').textContent=t('fasting.editFastZone',{zone:data.activeTimeZone||currentTimeZone()});
    el('editActiveFastError').hidden=true;
    document.querySelectorAll('[data-edit-start-hours]').forEach(btn=>{btn.classList.remove('active');btn.setAttribute('aria-pressed','false');});
    syncEditFastPresetState();
    showModal('editActiveFastModal','editActiveFastStart');
  }

  function commitEditedActiveFast(start, goal) {
    if (!data.activeStart || recoveryMode) return false;
    const tz=normalizeTimeZone(data.activeTimeZone||currentTimeZone());
    const nextGoal=sanitizeGoal(goal,activeTargetHours());
    if(!confirm(t('fasting.editFastConfirm',{start:localDateTimeLabel(start,tz),goal:formatGoal(nextGoal)})))return false;
    data.activeStart=start.toISOString();data.activeGoalHours=nextGoal;data.activeTimeZone=tz;data.activeModifiedAt=new Date().toISOString();
    if(!save()){renderAll();return false;}
    hideModal('editActiveFastModal');invalidateDerivedCaches();renderAll();return true;
  }

  function saveEditedActiveFast() {
    if (!data.activeStart || recoveryMode) { hideModal('editActiveFastModal'); return; }
    const tz=normalizeTimeZone(data.activeTimeZone||currentTimeZone()), start=zonedLocalToDate(el('editActiveFastStart').value,tz), goal=parseLocalizedNumber(el('editActiveFastGoal').value), error=el('editActiveFastError');
    const fail=key=>{error.textContent=t(key);error.hidden=false;}; error.hidden=true;
    if(!start){fail('fasting.editFastErrStart');return;}
    if(start.getTime()>Date.now()+FUTURE_TOLERANCE_MS){fail('backdate.errFuture');return;}
    if(!Number.isFinite(goal)||goal<0.25||goal>120){fail('fasting.editFastErrGoal');return;}
    if(backdateConflicts(start,new Date()).length){fail('backdate.errOverlap');return;}
    const nextGoal=sanitizeGoal(goal,activeTargetHours());
    if(nextGoal>=LONG_FAST_NOTICE_HOURS&&!longFastNoticeSeen()){
      pendingLongFastGoal=nextGoal;pendingLongFastScope='editFast';pendingEditFastStart=start.toISOString();
      hideModal('editActiveFastModal');
      el('longFastModalText').textContent=t('safety.longFastText',{goal:formatGoal(nextGoal)});
      showModal('longFastModal','longFastCancelBtn');return;
    }
    commitEditedActiveFast(start,nextGoal);
  }

  function openFastTimingModal() {
    // Timing options configure a future or retrospective start only. Active
    // fast corrections belong exclusively to Edit fast; scheduled/recovery
    // states cannot open this workflow.
    if (data.activeStart || data.scheduledStart || recoveryMode) return;
    el('fastTimingMode').value = 'later';
    el('fastTimingAmount').value = '30';
    el('fastTimingUnit').value = 'minutes';
    el('fastTimingHint').textContent = t('fasting.timingLaterHint');
    el('fastTimingConfirm').textContent = t('fasting.timingSchedule');
    showModal('fastTimingModal', 'fastTimingMode');
  }

  function updateFastTimingHint() {
    const mode = el('fastTimingMode').value;
    el('fastTimingHint').textContent = t(mode === 'later' ? 'fasting.timingLaterHint' : 'fasting.timingAgoHint');
    el('fastTimingConfirm').textContent = t(mode === 'later' ? 'fasting.timingSchedule' : 'fasting.timingRecord');
  }

  function confirmFastTiming() {
    if (data.activeStart || data.scheduledStart) { hideModal('fastTimingModal'); return; }
    const amount = Number(el('fastTimingAmount').value);
    const unit = el('fastTimingUnit').value;
    if (!Number.isInteger(amount) || amount < 1 || amount > 120 || !['minutes','hours'].includes(unit)) {
      el('fastTimingAmount').focus(); return;
    }
    const delta = amount * (unit === 'hours' ? 3600000 : 60000);
    const now = Date.now(), tz = currentTimeZone();
    if (el('fastTimingMode').value === 'ago') {
      const start = new Date(now - delta);
      el('backdateStart').value = toLocalInputValue(start, tz);
      el('backdateTargetSummary').textContent = t('backdate.target', {goal:formatGoal(data.goalHours)});
      showBackdateError(''); clearBackdateConflict();
      hideModal('fastTimingModal');
      showModal('backdateModal','backdateStart');
      return;
    }
    const at = new Date(now + delta);
    data.scheduledStart = {at:at.toISOString(),goalHours:data.goalHours,timeZone:tz,createdAt:new Date(now).toISOString()};
    if (!save()) { data.scheduledStart=null; renderAll(); return; }
    hideModal('fastTimingModal');
    renderAll();
  }

  function postStartExtensionContext() {
    if (data.activeStart) return {
      mode: 'active',
      startAt: data.activeStart,
      createdAt: data.activeCreatedAt,
      goalHours: activeTargetHours(),
      timeZone: data.activeTimeZone || currentTimeZone()
    };
    if (data.scheduledStart) return {
      mode: 'scheduled',
      startAt: data.scheduledStart.at,
      createdAt: data.scheduledStart.createdAt,
      goalHours: data.scheduledStart.goalHours,
      timeZone: data.scheduledStart.timeZone || currentTimeZone()
    };
    return null;
  }

  function updateExtendNonFastingPreview() {
    const context = postStartExtensionContext();
    const minutes = Number(el('extendNonFastingAmount').value);
    const nextStart = context && resolvePostStartExtendedTimestamp(context.startAt, minutes);
    el('extendNonFastingPreview').textContent = nextStart == null
      ? ''
      : t('fasting.extendNonFastingPreview', {date:localDateTimeLabel(new Date(nextStart).toISOString(), context.timeZone)});
  }

  function openExtendNonFastingModal() {
    const context = postStartExtensionContext();
    if (!context || recoveryMode || !resolvePostStartExtensionWindow(context.createdAt, Date.now()).eligible) return;
    el('extendNonFastingAmount').value = '10';
    updateExtendNonFastingPreview();
    showModal('extendNonFastingModal', 'extendNonFastingAmount');
  }

  function confirmExtendNonFastingPeriod() {
    const context = postStartExtensionContext();
    const nowMs = Date.now();
    const minutes = Number(el('extendNonFastingAmount').value);
    if (!context || recoveryMode || !resolvePostStartExtensionWindow(context.createdAt, nowMs).eligible) {
      hideModal('extendNonFastingModal');
      renderAll();
      return;
    }
    const nextStartMs = resolvePostStartExtendedTimestamp(context.startAt, minutes);
    if (nextStartMs == null) { el('extendNonFastingAmount').focus(); return; }

    const previous = {
      activeStart: data.activeStart,
      activeGoalHours: data.activeGoalHours,
      activeTimeZone: data.activeTimeZone,
      activeCreatedAt: data.activeCreatedAt,
      activeModifiedAt: data.activeModifiedAt,
      scheduledStart: data.scheduledStart ? {...data.scheduledStart} : null
    };
    const nextStart = new Date(nextStartMs).toISOString();
    const createdAt = context.createdAt || new Date(nowMs).toISOString();
    if (nextStartMs > nowMs) {
      data.activeStart = null;
      data.activeGoalHours = null;
      data.activeTimeZone = null;
      data.activeCreatedAt = null;
      data.activeModifiedAt = null;
      data.scheduledStart = {
        at: nextStart,
        goalHours: context.goalHours,
        timeZone: context.timeZone,
        createdAt
      };
    } else {
      data.scheduledStart = null;
      data.activeStart = nextStart;
      data.activeGoalHours = context.goalHours;
      data.activeTimeZone = context.timeZone;
      data.activeCreatedAt = createdAt;
      data.activeModifiedAt = context.mode === 'active' ? new Date(nowMs).toISOString() : null;
    }

    if (!save()) {
      Object.assign(data, previous);
      renderAll();
      return;
    }
    clearShorterGoalState();
    hideModal('extendNonFastingModal');
    renderAll();
  }

  function adjustBackdateAfterConflicts() {
    if (!backdateConflictRecords.length) return;
    const latest = backdateConflictRecords[backdateConflictRecords.length - 1];
    const end = new Date(latest.end);
    el('backdateStart').value = toLocalInputValue(end, currentTimeZone());
    clearBackdateConflict();
    saveBackdatedActiveFast();
  }

  function editBackdateConflict() {
    if (backdateConflictRecords.length !== 1) return;
    const record = backdateConflictRecords[0];
    closeBackdateModal();
    openEntryModal(record);
  }

  function deleteBackdateConflictAndStart() {
    if (backdateConflictRecords.length !== 1) return;
    const record = backdateConflictRecords[0];
    if (!confirm(t('backdate.deleteConfirm'))) return;
    const move = moveFastToDeleted(record, 'backdate-conflict');
    if (!move) return;
    if (!save()) { rollbackDeletedFastMove(move); renderAll(); return; }
    clearBackdateConflict();
    saveBackdatedActiveFast();
  }

