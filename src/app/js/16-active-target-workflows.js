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

