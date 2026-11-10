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

  function setBackdatePreset(hours) {
    const d = new Date(Date.now() - Number(hours) * 3600000);
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

