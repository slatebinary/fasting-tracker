  function toLocalInputValue(dateLike, timeZone = currentTimeZone()) {
    const d = new Date(dateLike); if (!Number.isFinite(d.getTime())) return '';
    const p=zonedParts(d,timeZone);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
  }

  function showEntryError(message) {
    const box = el('entryError');
    box.textContent = message;
    box.hidden = !message;
  }

  function closeEntryModal() {
    hideModal('entryModal');
    editingRecordId = null;
    editingRecordTimeZone = null;
    showEntryError('');
  }

  function openEntryModal(record = null) {
    editingRecordId = record?.id || null;
    editingRecordTimeZone = record ? normalizeTimeZone(record.timeZone) : currentTimeZone();
    el('entryModalTitle').textContent = record ? t('history.editTitle') : t('history.addTitle');
    el('entryAuditHelp').hidden = !record;
    if (record) {
      el('entryStart').value = toLocalInputValue(record.start, editingRecordTimeZone);
      el('entryEnd').value = toLocalInputValue(record.end, editingRecordTimeZone);
      el('entryGoal').value = formatNumber(record.goalHours ?? data.goalHours, 0, 3);
      el('entryStopReason').value = normalizeStopReason(record.stopReason) || '';
    } else {
      const end = new Date();
      const start = new Date(end.getTime() - goalMs(data.goalHours));
      el('entryStart').value = toLocalInputValue(start);
      el('entryEnd').value = toLocalInputValue(end);
      el('entryGoal').value = formatNumber(data.goalHours, 0, 3);
      el('entryStopReason').value = '';
    }
    refreshEntryStopReasonVisibility();
    showEntryError('');
    showModal('entryModal', 'entryStart');
  }

  function refreshEntryStopReasonVisibility() {
    const group=el('entryStopReasonGroup'); if(!group)return;
    const tz=editingRecordTimeZone||currentTimeZone(), start=zonedLocalToDate(el('entryStart')?.value,tz), end=zonedLocalToDate(el('entryEnd')?.value,tz), target=parseLocalizedNumber(el('entryGoal')?.value);
    const missed=!!(start&&end&&end>start&&Number.isFinite(target)&&target>0&&(end-start)<goalMs(target));
    group.hidden=!missed;
    if(!missed&&el('entryStopReason'))el('entryStopReason').value='';
  }

  function intervalOverlaps(start, end, excludeId = null) {
    const s = start.getTime(), e = end.getTime();
    for (const r of data.records) {
      if (r.id === excludeId) continue;
      const rs = new Date(r.start).getTime(), re = new Date(r.end).getTime();
      if (s < re && e > rs) return true;
    }
    if (data.activeStart) {
      const as = new Date(data.activeStart).getTime(), ae = Date.now();
      if (s < ae && e > as) return true;
    }
    return false;
  }

  function fastingRecordCoreEqual(a, b) {
    if (!a || !b) return false;
    return String(a.start) === String(b.start) && String(a.end) === String(b.end) &&
      sanitizeGoal(a.goalHours, data.goalHours) === sanitizeGoal(b.goalHours, data.goalHours) &&
      normalizeTimeZone(a.timeZone) === normalizeTimeZone(b.timeZone) &&
      normalizeStopReason(a.stopReason) === normalizeStopReason(b.stopReason);
  }

  function fastEditAuditEntry(record, editedAt = new Date().toISOString()) {
    return {
      editedAt, editedTimeZone: currentTimeZone(),
      start: record.start, end: record.end, goalHours: sanitizeGoal(record.goalHours, data.goalHours),
      timeZone: normalizeTimeZone(record.timeZone), stopReason: normalizeStopReason(record.stopReason)
    };
  }

  function substantialFastEdit(previous, next) {
    const oldStart = validDate(previous?.start), oldEnd = validDate(previous?.end), newStart = validDate(next?.start), newEnd = validDate(next?.end);
    if (!oldStart || !oldEnd || !newStart || !newEnd) return true;
    const threshold = 30 * 60 * 1000;
    const startShift = Math.abs(newStart - oldStart), endShift = Math.abs(newEnd - oldEnd);
    const durationShift = Math.abs((newEnd - newStart) - (oldEnd - oldStart));
    const goalShift = Math.abs(sanitizeGoal(previous.goalHours, data.goalHours) - sanitizeGoal(next.goalHours, data.goalHours));
    const oldStartDay = dayKeyFast(previous.start, previous.timeZone), newStartDay = dayKeyFast(next.start, next.timeZone);
    const oldEndDay = dayKeyFast(previous.end, previous.timeZone), newEndDay = dayKeyFast(next.end, next.timeZone);
    return startShift >= threshold || endShift >= threshold || durationShift >= threshold || goalShift >= 1 ||
      oldStartDay !== newStartDay || oldEndDay !== newEndDay || recordMetGoal(previous) !== recordMetGoal(next);
  }

  function fastEditSummary(record) {
    const zone = normalizeTimeZone(record.timeZone);
    const base=t('history.editSummary', {
      start: localDateTimeLabel(record.start, zone),
      end: localDateTimeLabel(record.end, zone),
      goal: formatGoal(record.goalHours)
    });
    return normalizeStopReason(record.stopReason) ? `${base} • ${t('fasting.stopReasonSummary',{reason:stopReasonLabel(record.stopReason)})}` : base;
  }

  function saveManualEntry() {
    const tz = editingRecordTimeZone || currentTimeZone();
    const start = zonedLocalToDate(el('entryStart').value, tz);
    const end = zonedLocalToDate(el('entryEnd').value, tz);
    const target = parseLocalizedNumber(el('entryGoal').value);
    if (!start || !end) { showEntryError(t('history.errDates')); return; }
    if (end <= start) { showEntryError(t('history.errEndAfter')); return; }
    if (end.getTime() > Date.now() + 60000) { showEntryError(t('history.errFuture')); return; }
    if (end - start < 60000) { showEntryError(t('history.errMinute')); return; }
    if (!Number.isFinite(target) || target <= 0) { showEntryError(t('history.errGoal')); return; }
    if (intervalOverlaps(start, end, editingRecordId)) { showEntryError(t('history.errOverlap')); return; }

    const existingRecord = editingRecordId ? data.records.find(r => r.id === editingRecordId) : null;
    const nowAudit = new Date().toISOString();
    const draft = {
      id: editingRecordId || makeId(),
      start: start.toISOString(),
      end: end.toISOString(),
      goalHours: sanitizeGoal(target, data.goalHours),
      timeZone: tz,
      createdAt: existingRecord ? normalizeAuditTimestamp(existingRecord.createdAt) : nowAudit,
      modifiedAt: existingRecord ? nowAudit : null,
      editHistory: existingRecord ? normalizeFastEditHistory(existingRecord.editHistory) : [],
      stopReason: (end - start) < goalMs(target) ? normalizeStopReason(el('entryStopReason')?.value) : null
    };
    if (existingRecord && fastingRecordCoreEqual(existingRecord, draft)) { closeEntryModal(); return; }
    if (existingRecord && substantialFastEdit(existingRecord, draft)) {
      const message = t('history.editMaterialConfirm', {before:fastEditSummary(existingRecord), after:fastEditSummary(draft)});
      if (!confirm(message)) return;
    }
    if (existingRecord) {
      draft.editHistory = [...draft.editHistory, fastEditAuditEntry(existingRecord, nowAudit)].slice(-MAX_FAST_EDIT_AUDIT);
      data.records = data.records.map(r => r.id === editingRecordId ? draft : r);
    } else data.records.push(draft);
    if (!save()) { renderAll(); return; }
    closeEntryModal();
    renderAll();
  }

  function bindResponsiveAction(node, handler) {
    if (!node || typeof handler !== 'function') return;
    let pointerHandledAt = 0;
    let pointerStart = null;
    const flash = () => {
      node.classList.add('fastActionPressed');
      setTimeout(() => node.classList.remove('fastActionPressed'), 90);
    };
    node.addEventListener('pointerdown', event => {
      if (event.button != null && event.button !== 0) return;
      pointerStart = { id:event.pointerId, x:event.clientX, y:event.clientY };
      node.classList.add('fastActionPressed');
    });
    node.addEventListener('pointercancel', () => { pointerStart = null; node.classList.remove('fastActionPressed'); });
    node.addEventListener('pointerup', event => {
      const start = pointerStart;
      pointerStart = null;
      node.classList.remove('fastActionPressed');
      if (!start || start.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
      pointerHandledAt = performance.now();
      if (event.cancelable) event.preventDefault();
      flash();
      handler(event);
    });
    node.addEventListener('click', event => {
      if (event.detail !== 0 && performance.now() - pointerHandledAt < 700) { event.preventDefault(); return; }
      flash();
      handler(event);
    });
  }

  function bindReliableModalAction(node, handler) {
    if (!node || typeof handler !== 'function') return;
    let locked = false;
    node.addEventListener('click', event => {
      if (locked) return;
      locked = true;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      node.classList.add('fastActionPressed');
      setTimeout(() => node.classList.remove('fastActionPressed'), 90);
      try { handler(event); } finally { setTimeout(() => { locked = false; }, 250); }
    });
  }

  function scheduleWeightUiRefresh() {
    // Let a modal close / deleted row disappear before rebuilding summaries,
    // history and the weight chart.
    requestAnimationFrame(() => setTimeout(() => {
      renderWeight();
      viewDirty.weight = false;
      if (el('stats').classList.contains('active')) { renderGamification(); viewDirty.stats = true; }
      if (el('fasting').classList.contains('active')) { renderGamificationSummary(); viewDirty.fasting = false; }
      renderBackupStatus();
    }, 0));
  }

  function showWeightError(message) {
    const box = el('weightError');
    box.textContent = message;
    box.hidden = !message;
  }

  function closeWeightModal() {
    hideModal('weightModal');
    editingWeightId = null;
    editingWeightTimeZone = null;
    showWeightError('');
  }

  function openWeightModal(entry = null) {
    editingWeightId = entry?.id || null;
    editingWeightTimeZone = entry ? normalizeTimeZone(entry.timeZone) : currentTimeZone();
    const unit = data.weightUnit;
    el('weightModalTitle').textContent = entry ? t('weight.editTitle') : t('weight.addTitle');
    el('weightModalUnit').textContent = unit;
    el('weightWhen').value = toLocalInputValue(entry?.when || new Date(), editingWeightTimeZone);
    const shown = entry ? kgToDisplay(entry.kg, unit) : null;
    el('weightValueInput').value = shown == null ? '' : formatNumber(shown, 1, 1);
    showWeightError('');
    showModal('weightModal', 'weightValueInput');
  }

  function saveWeightEntry() {
    const tz = editingWeightTimeZone || currentTimeZone();
    const when = zonedLocalToDate(el('weightWhen').value, tz);
    const raw = parseLocalizedNumber(el('weightValueInput').value);
    const kg = sanitizeWeightKg(displayToKg(raw, data.weightUnit), null);
    if (!when) { showWeightError(t('weight.errDate')); return; }
    if (when.getTime() > Date.now() + 60000) { showWeightError(t('weight.errFuture')); return; }
    if (kg == null) { showWeightError(t('weight.errValue', {unit:data.weightUnit})); return; }
    const existingWeight = editingWeightId ? data.weights.find(w => w.id === editingWeightId) : null;
    const nowAudit = new Date().toISOString();
    const whenIso = when.toISOString();
    const entry = {
      id: editingWeightId || makeId(), when: whenIso, kg, timeZone: tz,
      calendarDay: dayKeyFast(whenIso, tz),
      createdAt: existingWeight ? normalizeAuditTimestamp(existingWeight.createdAt) : nowAudit,
      modifiedAt: existingWeight ? nowAudit : null
    };
    if (editingWeightId) data.weights = data.weights.map(w => w.id === editingWeightId ? entry : w);
    else data.weights.push(entry);
    if (!save({ invalidateDerived: true, dirtyViews:['weight','stats','settings','fasting'] })) { renderAll(); return; }
    closeWeightModal();
    scheduleWeightUiRefresh();
  }


