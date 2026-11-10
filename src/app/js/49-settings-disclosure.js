// Settings disclosure state, search filtering, and persisted group expansion.
  let settingsSearchActive = false;
  let settingsGroupToggleSuppressed = false;

  function settingsGroups() { return [...document.querySelectorAll('#settings .settingsGroup[data-settings-group]')]; }
  function loadSettingsGroupState() {
    try { const x=JSON.parse(localStorage.getItem(SETTINGS_GROUPS_KEY)||'{}'); return x && typeof x==='object' ? x : {}; } catch { return {}; }
  }
  function saveSettingsGroupState() {
    if (settingsSearchActive || settingsGroupToggleSuppressed) return;
    const state={}; settingsGroups().forEach(group=>{state[group.id]=!!group.open;});
    try { localStorage.setItem(SETTINGS_GROUPS_KEY,JSON.stringify(state)); } catch {}
  }
  function restoreSettingsGroupState() {
    const state=loadSettingsGroupState();
    settingsGroupToggleSuppressed=true;
    settingsGroups().forEach(group=>{
      group.hidden=false;
      // Keep app icons prominent by default, but honour the user's saved
      // disclosure choice after they collapse or reopen the section.
      group.open=Object.prototype.hasOwnProperty.call(state,group.id)?!!state[group.id]:(group.id==='settingsGroupAppIcons'||group.id==='settingsGroupGeneral');
    });
    settingsGroupToggleSuppressed=false;
  }
  function normalizeSettingsSearch(value) { return String(value||'').trim().toLocaleLowerCase(uiLanguage()); }
  function applySettingsSearch() {
    const input=el('settingsSearchInput'), clear=el('settingsSearchClearBtn'), status=el('settingsSearchStatus');
    if (!input || !status) return;
    const query=normalizeSettingsSearch(input.value); settingsSearchActive=!!query;
    if (clear) clear.hidden=!query;
    if (!query) { restoreSettingsGroupState(); status.textContent=''; return; }
    settingsGroupToggleSuppressed=true;
    let matches=0;
    settingsGroups().forEach(group=>{
      const hay=normalizeSettingsSearch(group.textContent);
      const matched=hay.includes(query);
      group.hidden=!matched; group.open=matched; if(matched)matches++;
      if (matched) group.querySelectorAll('.settingsSubgroup').forEach(subgroup=>{
        if (normalizeSettingsSearch(subgroup.textContent).includes(query)) subgroup.open=true;
      });
    });
    settingsGroupToggleSuppressed=false;
    status.textContent=matches?t('settings.searchResults',{n:matches}):t('settings.searchNoResults');
    if (el('settingsGroupAdvanced')?.open || el('settingsUpdateAdvanced')?.open) renderStorageHealth();
    if (el('settingsGroupData')?.open) queueStorageProtectionRefresh();
  }
  function initSettingsDisclosure() {
    restoreSettingsGroupState();
    settingsGroups().forEach(group=>group.addEventListener('toggle',()=>{
      // Persist the user's disclosure choice, including a collapsed app-icon section.
      saveSettingsGroupState();
      if (group.id==='settingsGroupAdvanced' && group.open) renderStorageHealth();
      if (group.id==='settingsGroupData' && group.open) queueStorageProtectionRefresh();
    }));
    el('settingsUpdateAdvanced')?.addEventListener('toggle',()=>{if(el('settingsUpdateAdvanced').open)renderStorageHealth();});
    el('settingsSearchInput')?.addEventListener('input',applySettingsSearch);
    el('settingsSearchClearBtn')?.addEventListener('click',()=>{const input=el('settingsSearchInput');if(input){input.value='';input.focus();}applySettingsSearch();});
  }

