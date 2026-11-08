  function weightWeekStreak() {
    const weeks = new Set(data.weights.map(w => weekKeyFromDayString(weightCalendarDay(w))).filter(Boolean));
    if (!weeks.size) return 0;
    let cursor = startOfWeek();
    let key=weekKeyFromDayString(dayKeyFast(cursor,currentTimeZone()));
    if (!weeks.has(key)) {
      cursor.setDate(cursor.getDate() - 7);
      key=weekKeyFromDayString(dayKeyFast(cursor,currentTimeZone()));
      if (!weeks.has(key)) return 0;
    }
    let streak = 0;
    while (weeks.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 7);
      key=weekKeyFromDayString(dayKeyFast(cursor,currentTimeZone()));
    }
    return streak;
  }

  function hasComebackAchievement() {
    const sorted = sortedRecordsAsc().filter(r => !isExcusedStop(r));
    for (let i = 1; i < sorted.length; i++) {
      if (!recordMetGoal(sorted[i - 1]) && recordMetGoal(sorted[i])) return true;
    }
    return false;
  }

  function achievementDefinitions() {
    const wins = successfulFastCount();
    const consecutiveWins = currentStreak();
    const weightStreak = weightWeekStreak();
    const backupFresh = !!validDate(backupMeta.lastExternalBackupAt) && !backupIsDue();
    return [
      { icon: '✓', title: t('game.ach1'), detail: t('game.ach1d'), unlocked: wins >= 1 },
      { icon: '5', title: t('game.ach5'), detail: t('game.ach5d'), unlocked: wins >= 5 },
      { icon: '10', title: t('game.ach10'), detail: t('game.ach10d'), unlocked: wins >= 10 },
      { icon: '25', title: t('game.ach25'), detail: t('game.ach25d'), unlocked: wins >= 25 },
      { icon: '50', title: t('game.ach50'), detail: t('game.ach50d'), unlocked: wins >= 50 },
      { icon: '5↻', title: t('game.streak5'), detail: t('game.streak5d'), unlocked: consecutiveWins >= 5 },
      { icon: '25↻', title: t('game.streak25'), detail: t('game.streak25d'), unlocked: consecutiveWins >= 25 },
      { icon: '50↻', title: t('game.streak50'), detail: t('game.streak50d'), unlocked: consecutiveWins >= 50 },
      { icon: '↗', title: t('game.comeback'), detail: t('game.comebackd'), unlocked: hasComebackAchievement() },
      { icon: '⚖', title: t('game.weightHabit'), detail: t('game.weightHabitd'), unlocked: weightStreak >= 4 },
      { icon: '⇩', title: t('game.backupKeeper'), detail: t('game.backupKeeperd'), unlocked: backupFresh }
    ];
  }

  function gamificationSummaryModel() {
    const xp = gamificationXP();
    const level = levelForXP(xp);
    let fillPct = 100;
    if (level.next != null) fillPct = ((xp - level.min) / (level.next - level.min)) * 100;
    return { xp, level, fillPct: Math.max(0, Math.min(100, fillPct)) };
  }

  function renderGamificationSummary() {
    const enabled = data.gamificationEnabled !== false;
    const summary = el('gamificationSummary');
    if (summary) summary.hidden = !enabled;
    if (!enabled || !summary) return;

    const { xp, level, fillPct } = gamificationSummaryModel();
    el('gSummaryLevel').textContent = t('game.level', {n: level.number});
    el('gSummaryXP').textContent = `${formatNumber(xp)} XP`;
    el('gSummaryNext').textContent = level.next == null ? t('game.highest') : t('game.next', {xp: Math.max(0, level.next - xp)});
    el('gSummaryFill').style.width = `${fillPct}%`;
    el('xpProgressTrack').setAttribute('aria-valuenow', String(Math.round(fillPct)));
    el('xpProgressTrack').setAttribute('aria-valuetext', level.next == null ? t('game.highest') : t('game.next', {xp: Math.max(0, level.next - xp)}));
  }

  function renderGamificationDetail() {
    const enabled = data.gamificationEnabled !== false;
    const detail = el('gamificationDetail');
    if (detail) detail.hidden = !enabled;
    const toggle = el('gamificationToggle');
    if (toggle) toggle.checked = enabled;
    if (!enabled || !detail) return;

    const { xp, level, fillPct } = gamificationSummaryModel();
    const levelLabel = t('game.levelFull', {n: level.number, name: t(level.nameKey)});
    el('gDetailLevel').textContent = levelLabel;
    el('gXP').textContent = formatNumber(xp);
    el('xpProgressTrack').setAttribute('aria-valuenow', String(Math.round(fillPct)));
    el('xpProgressTrack').setAttribute('aria-valuetext', level.next == null ? t('game.highest') : t('game.next', {xp: Math.max(0, level.next - xp)}));

    const weekly = weeklyTargetSuccessRate();
    el('gWeekly').textContent = weekly == null ? '—' : `${weekly}%`;
    el('gWeightStreak').textContent = formatNumber(weightWeekStreak());

    const box = el('achievementBadges');
    box.replaceChildren();
    for (const achievement of achievementDefinitions()) {
      const item = document.createElement('div');
      item.className = `achievementBadge ${achievement.unlocked ? 'unlocked' : 'locked'}`;
      item.setAttribute('role', 'group');
      item.setAttribute('aria-label', `${achievement.title}: ${t(achievement.unlocked ? 'game.unlocked' : 'game.locked')}. ${achievement.detail}`);
      const icon = document.createElement('div'); icon.className = 'badgeIcon'; icon.textContent = achievement.icon;
      const title = document.createElement('strong'); title.textContent = achievement.title;
      const detailText = document.createElement('div'); detailText.className = 'small'; detailText.textContent = achievement.detail;
      item.append(icon, title, detailText);
      box.append(item);
    }
  }

  function renderGamification() {
    renderGamificationSummary();
    renderGamificationDetail();
  }


  let statsGamificationRenderToken = 0;
  let statsGamificationRenderTimer = 0;

  function scheduleStatsGamificationDetail() {
    const token = ++statsGamificationRenderToken;
    if (statsGamificationRenderTimer) { clearTimeout(statsGamificationRenderTimer); statsGamificationRenderTimer = 0; }
    requestAnimationFrame(() => {
      if (token !== statsGamificationRenderToken) return;
      statsGamificationRenderTimer = setTimeout(() => {
        statsGamificationRenderTimer = 0;
        if (token !== statsGamificationRenderToken || !el('stats').classList.contains('active')) return;
        renderGamificationDetail();
      }, 0);
    });
  }

