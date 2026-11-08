  function statsSummary() {
    if (statsSummaryCache) return statsSummaryCache;
    statsSummaryCache = FTAnalytics.summarizeRecords(data.records, {
      durationGetter: recordMs,
      goalGetter: recordMetGoal,
      streak: currentStreak()
    });
    return statsSummaryCache;
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

  function renderStats() {
    const summary = statsSummary();
    el('mTotal').textContent = formatNumber(summary.count);
    el('mAverage').textContent = summary.count ? compactDuration(summary.average) : `0${t('unit.h')}`;
    el('mLongest').textContent = summary.count ? compactDuration(summary.longest) : `0${t('unit.h')}`;
    el('mGoal').textContent = formatNumber(summary.goalCount);
    el('mStreak').textContent = formatNumber(summary.streak);
    el('mHours').textContent = summary.total ? compactDuration(summary.total) : `0${t('unit.h')}`;
    renderGamificationSummary();
    renderStatsVisualizations();
    scheduleStatsGamificationDetail();
  }

