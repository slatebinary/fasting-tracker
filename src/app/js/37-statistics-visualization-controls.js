  function statsVizGroupForMode(mode) {
    for (const [group,modes] of Object.entries(STATS_VIZ_GROUPS)) if (modes.includes(mode)) return group;
    return 'overview';
  }

  function defaultStatsVizPrefs() {
    return { activeGroup:'overview', lastByGroup:{ overview:'timeline', timing:'startpattern', goals:'success', longterm:'cumulative' } };
  }

  function loadStatsVizPrefs() {
    const fallback=defaultStatsVizPrefs();
    try {
      const parsed=JSON.parse(localStorage.getItem(STATS_VIZ_PREF_KEY)||'null');
      if(!parsed||typeof parsed!=='object')return fallback;
      const activeGroup=Object.hasOwn(STATS_VIZ_GROUPS,parsed.activeGroup)?parsed.activeGroup:'overview';
      const lastByGroup={...fallback.lastByGroup};
      for(const [group,modes] of Object.entries(STATS_VIZ_GROUPS)){const candidate=parsed.lastByGroup?.[group];if(modes.includes(candidate))lastByGroup[group]=candidate;}
      return {activeGroup,lastByGroup};
    } catch { return fallback; }
  }

  function saveStatsVizPrefs() {
    try { localStorage.setItem(STATS_VIZ_PREF_KEY,JSON.stringify(statsVizPrefs)); } catch {}
  }

  function syncStatsVizNavigator() {
    const group=statsVizGroupForMode(statsVizMode);
    statsVizGroup=group;
    document.querySelectorAll('#statsVizGroupSwitcher [data-viz-group]').forEach(btn=>{
      const active=btn.dataset.vizGroup===group;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',String(active));
      btn.tabIndex=active?0:-1;
    });
    const select=el('statsVizSelect');
    if(select&&select.value!==statsVizMode)select.value=statsVizMode;
  }

  function setStatsVizGroup(group) {
    if(!Object.hasOwn(STATS_VIZ_GROUPS,group))return;
    statsVizGroup=group;
    statsVizPrefs.activeGroup=group;
    const preferred=STATS_VIZ_GROUPS[group].includes(statsVizPrefs.lastByGroup?.[group])?statsVizPrefs.lastByGroup[group]:STATS_VIZ_GROUPS[group][0];
    saveStatsVizPrefs();
    setStatsVizMode(preferred);
  }

  function activateStatsVizGroupControl(target) {
    const button=target?.closest?.('#statsVizGroupSwitcher [data-viz-group]');
    if(!button)return false;
    button.classList.add('pressed');
    setTimeout(()=>button.classList.remove('pressed'),100);
    setStatsVizGroup(button.dataset.vizGroup);
    return true;
  }

  function handleStatsVizGroupPointerDown(event) {
    if(!activateStatsVizGroupControl(event.target))return;
    statsVizPointerStamp=performance.now();
    if(event.cancelable)event.preventDefault();
  }

  function handleStatsVizGroupClick(event) {
    if(event.detail!==0&&performance.now()-statsVizPointerStamp<700)return;
    activateStatsVizGroupControl(event.target);
  }

  function showStatsVizView(mode) {
    const map = { timeline:'statsTimelineView', calendar:'statsCalendarView', trend:'statsTrendView', weeks:'statsWeeksView', months:'statsMonthsView', distribution:'statsDistributionView', success:'statsSuccessView', startpattern:'statsStartPatternView', cumulative:'statsCumulativeView' };
    for (const [key,id] of Object.entries(map)) el(id).hidden = key !== mode;
  }

  function renderStatsVisualizationMode(mode = statsVizMode) {
    if (mode === 'calendar') renderFastCalendar();
    else if (mode === 'trend') drawFastTrendChart();
    else if (mode === 'weeks') drawFastWeeksChart();
    else if (mode === 'months') drawFastMonthsChart();
    else if (mode === 'distribution') drawFastDistributionChart();
    else if (mode === 'success') drawFastSuccessChart();
    else if (mode === 'startpattern') drawFastStartPatternChart();
    else if (mode === 'cumulative') drawFastCumulativeChart();
    else drawChart();
    statsVizRendered.add(mode);
    if(el('statsChartData')&&!el('statsChartData').hidden)renderStatsChartData();
  }

  function scheduleStatsVizRender(mode) {
    const requestedMode = mode;
    const token = ++statsVizRenderFrame;
    if (statsVizRenderTimer) { clearTimeout(statsVizRenderTimer); statsVizRenderTimer = 0; }

    // A single requestAnimationFrame still runs before the browser paints, so
    // expensive chart work in that callback can hide the tab change. Schedule
    // the work as a timer from the frame callback: the browser gets one paint
    // with the newly selected tab/view before any chart calculation begins.
    requestAnimationFrame(() => {
      if (token !== statsVizRenderFrame || statsVizMode !== requestedMode) return;
      statsVizRenderTimer = setTimeout(() => {
        statsVizRenderTimer = 0;
        if (token !== statsVizRenderFrame || statsVizMode !== requestedMode) return;
        renderStatsVisualizationMode(requestedMode);
        renderChartDetailForMode();
      }, 0);
    });
  }

  function setStatsVizMode(mode) {
    const allowed=Object.values(STATS_VIZ_GROUPS).flat();
    const nextMode=allowed.includes(mode)?mode:'timeline';
    const nextGroup=statsVizGroupForMode(nextMode);
    const changed=statsVizMode!==nextMode;
    statsVizMode=nextMode;
    statsVizGroup=nextGroup;
    statsVizPrefs.activeGroup=nextGroup;
    statsVizPrefs.lastByGroup[nextGroup]=nextMode;
    saveStatsVizPrefs();
    syncStatsVizNavigator();
    showStatsVizView(statsVizMode);
    updateStatsRangeControl();
    if(!changed){
      if(el('stats').classList.contains('active')) verifyStatsVisualizationAfterLayout();
      return;
    }
    statsDetailOverride=null;
    genericChartSelectedKey=null;
    if(statsVizMode==='timeline')timelineScrollToLatestPending=true;

    // Switch the panel and explanatory copy immediately. If this mode was
    // already rendered for the current data revision, no chart work is needed
    // at all, making repeat switches effectively instantaneous.
    showStatsVizView(statsVizMode);
    updateStatsRangeControl();
    renderChartDetailForMode();
    if(!statsVizRendered.has(statsVizMode)||data.activeStart)scheduleStatsVizRender(statsVizMode);
  }

  function renderStatsVisualizations() {
    syncStatsVizNavigator();
    // Always re-apply the remembered panel before drawing. A persisted non-default
    // view can otherwise remain hidden while its chart is rendered off-screen.
    showStatsVizView(statsVizMode);
    updateStatsRangeControl();
    // Let the Statistics screen paint its summary and controls before doing
    // chart aggregation. The active visualization is then rendered by the same
    // cancellable, post-paint scheduler used for subsequent mode changes.
    renderChartDetailForMode();
    if (!statsVizRendered.has(statsVizMode) || data.activeStart) scheduleStatsVizRender(statsVizMode);
  }

  function verifyStatsVisualizationAfterLayout() {
    // iOS can expose the Statistics screen before its final layout width is ready.
    // Verify the active panel on the next paint and redraw only that visualization.
    requestAnimationFrame(() => {
      if (!el('stats').classList.contains('active')) return;
      showStatsVizView(statsVizMode);
      syncStatsVizNavigator();
      updateStatsRangeControl();
      renderChartDetailForMode();
      // Re-render after the final layout through the post-paint scheduler;
      // never perform expensive chart aggregation inside this animation frame.
      scheduleStatsVizRender(statsVizMode);
      if (statsVizMode === 'timeline') scrollTimelineToLatest();
    });
  }

