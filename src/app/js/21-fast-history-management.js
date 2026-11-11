  function historyFilterSpec() {
    const numberOrNull=id=>{const v=parseFloat(el(id)?.value||'');return Number.isFinite(v)&&v>=0?v:null;};
    return {
      from:el('historyFilterFrom')?.value||'', to:el('historyFilterTo')?.value||'',
      min:numberOrNull('historyFilterMin'), max:numberOrNull('historyFilterMax'),
      target:el('historyFilterTarget')?.value||'all', edited:el('historyFilterEdited')?.value||'all',
      includeDeleted:el('historyIncludeDeleted')?.checked!==false
    };
  }

  function fastPassesHistoryFilter(record, spec=historyFilterSpec()) {
    const key=dayKey(record.end,record.timeZone);
    if(spec.from&&key<spec.from)return false; if(spec.to&&key>spec.to)return false;
    const hours=recordMs(record)/3600000; if(spec.min!=null&&hours<spec.min)return false; if(spec.max!=null&&hours>spec.max)return false;
    const met=recordMetGoal(record); if(spec.target==='reached'&&!met)return false; if(spec.target==='missed'&&met)return false; if(spec.target==='excused'&&!isExcusedStop(record))return false;
    const edited=Array.isArray(record.editHistory)&&record.editHistory.length>0; if(spec.edited==='edited'&&!edited)return false; if(spec.edited==='original'&&edited)return false;
    return true;
  }

  function historyFilterActive(spec=historyFilterSpec()) { return !!(spec.from||spec.to||spec.min!=null||spec.max!=null||spec.target!=='all'||spec.edited!=='all'); }
  function weightFilterSpec() { return {from:el('weightFilterFrom')?.value||'',to:el('weightFilterTo')?.value||'',includeDeleted:el('weightIncludeDeleted')?.checked!==false}; }
  function weightFilterActive(spec=weightFilterSpec()) { return !!(spec.from||spec.to); }
  function weightPassesFilter(record,spec=weightFilterSpec()){const key=dayKey(record.when,record.timeZone);return !(spec.from&&key<spec.from)&&!(spec.to&&key>spec.to);}

  function fastHistoryRangeCutoff(range) {
    const months = ({month:1,halfyear:6,year:12})[range];
    if (!months) return null;
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    cutoff.setMonth(cutoff.getMonth() - months);
    const day = Math.min(now.getDate(), new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate());
    cutoff.setDate(day);
    cutoff.setHours(0, 0, 0, 0);
    return cutoff.getTime();
  }

  function fastHistoryRecordsForDisplay(sortedDesc) {
    if (historyRange === 'recent7') return sortedDesc.slice(0, 7);
    if (historyRange === 'all') return sortedDesc;
    const cutoff = fastHistoryRangeCutoff(historyRange);
    return cutoff == null ? sortedDesc.slice(0, 7) : sortedDesc.filter(record => {
      const timestamp = Date.parse(record.end);
      return Number.isFinite(timestamp) && timestamp >= cutoff;
    });
  }

  function visibleFastHistoryRecords() {
    const spec = historyFilterSpec();
    const sorted = sortedRecordsDesc();
    const filtered = historyFilterActive(spec) ? sorted.filter(record => fastPassesHistoryFilter(record, spec)) : sorted;
    return fastHistoryRecordsForDisplay(filtered);
  }

  function bulkCheckbox(id,set,label) {
    const wrap=document.createElement('label'); wrap.className='bulkSelectCell';
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=set.has(id); cb.setAttribute('aria-label',label);
    cb.addEventListener('change',()=>{if(cb.checked)set.add(id);else set.delete(id);updateBulkActionBars();}); wrap.append(cb); return wrap;
  }

  function updateBulkActionBars() {
    const hb=el('historyBulkBar'),dfb=el('deletedFastBulkBar'),wb=el('weightBulkBar'),dwb=el('deletedWeightBulkBar');
    if(hb)hb.hidden=!historyBulkMode; if(dfb)dfb.hidden=!historyBulkMode; if(wb)wb.hidden=!weightBulkMode; if(dwb)dwb.hidden=!weightBulkMode;
    if(el('historyBulkCount'))el('historyBulkCount').textContent=t('bulk.selected',{n:selectedFastIds.size});
    if(el('deletedFastBulkCount'))el('deletedFastBulkCount').textContent=t('bulk.selected',{n:selectedDeletedFastIds.size});
    if(el('weightBulkCount'))el('weightBulkCount').textContent=t('bulk.selected',{n:selectedWeightIds.size});
    if(el('deletedWeightBulkCount'))el('deletedWeightBulkCount').textContent=t('bulk.selected',{n:selectedDeletedWeightIds.size});
    for(const [id,count] of [['historyBulkExportBtn',selectedFastIds.size],['historyBulkDeleteBtn',selectedFastIds.size],['deletedFastBulkExportBtn',selectedDeletedFastIds.size],['deletedFastBulkRestoreBtn',selectedDeletedFastIds.size],['deletedFastBulkPurgeBtn',selectedDeletedFastIds.size],['weightBulkExportBtn',selectedWeightIds.size],['weightBulkDeleteBtn',selectedWeightIds.size],['deletedWeightBulkExportBtn',selectedDeletedWeightIds.size],['deletedWeightBulkRestoreBtn',selectedDeletedWeightIds.size],['deletedWeightBulkPurgeBtn',selectedDeletedWeightIds.size]]){const node=el(id);if(node)node.disabled=!count;}
    const hbtn=el('historyBulkModeBtn'); if(hbtn){hbtn.setAttribute('aria-pressed',String(historyBulkMode));hbtn.textContent=t(historyBulkMode?'bulk.done':'bulk.select');}
    const wbtn=el('weightBulkModeBtn'); if(wbtn){wbtn.setAttribute('aria-pressed',String(weightBulkMode));wbtn.textContent=t(weightBulkMode?'bulk.done':'bulk.select');}
  }

  function clearHistoryFilters(){for(const id of ['historyFilterFrom','historyFilterTo','historyFilterMin','historyFilterMax'])if(el(id))el(id).value='';if(el('historyFilterTarget'))el('historyFilterTarget').value='all';if(el('historyFilterEdited'))el('historyFilterEdited').value='all';if(el('historyIncludeDeleted'))el('historyIncludeDeleted').checked=true;historyVisibleCount=HISTORY_PAGE_SIZE;deletedHistoryVisibleCount=HISTORY_PAGE_SIZE;historyRange='recent7';historyRangeMenuOpen=false;renderHistory();}
  function clearWeightFilters(){for(const id of ['weightFilterFrom','weightFilterTo'])if(el(id))el(id).value='';if(el('weightIncludeDeleted'))el('weightIncludeDeleted').checked=true;weightVisibleCount=HISTORY_PAGE_SIZE;renderWeight();}

  function exportFastRecordsCsv(records, namePrefix='fasting-selected') {
    const headers=['id','start','start_local','end','end_local','duration_hours','target_hours','target_reached','stop_reason','excused_stop','time_zone','created_at','modified_at','edit_count','deleted_at'];
    const rows=records.map(r=>[r.id,r.start,localDateTimeLabel(r.start,r.timeZone),r.end,localDateTimeLabel(r.end,r.timeZone),(recordMs(r)/3600000).toFixed(4),r.goalHours,recordMetGoal(r)?'true':'false',normalizeStopReason(r.stopReason)||'',isExcusedStop(r)?'true':'false',r.timeZone,r.createdAt||'',r.modifiedAt||'',Array.isArray(r.editHistory)?r.editHistory.length:0,r.deletedAt||'']);
    return shareOrDownloadText(csvText(headers,rows),`${namePrefix}-${csvTimestamp()}.csv`);
  }
  function exportWeightRecordsCsv(records,namePrefix='weight-selected'){
    const headers=['id','when','when_local','weight_kg','time_zone','created_at','modified_at','deleted_at'];
    const rows=records.map(w=>[w.id,w.when,localDateTimeLabel(w.when,w.timeZone),w.kg,w.timeZone,w.createdAt||'',w.modifiedAt||'',w.deletedAt||'']);
    return shareOrDownloadText(csvText(headers,rows),`${namePrefix}-${csvTimestamp()}.csv`);
  }

  function canRestoreFastBatch(records){
    const intervals=data.records.map(r=>[new Date(r.start).getTime(),new Date(r.end).getTime()]);
    if(data.activeStart) intervals.push([new Date(data.activeStart).getTime(),Date.now()+FUTURE_TOLERANCE_MS]);
    for(const r of records){const a=new Date(r.start).getTime(),b=new Date(r.end).getTime();if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return false;for(const [x,y] of intervals)if(a<y&&b>x)return false;intervals.push([a,b]);}
    return true;
  }

  function bulkDeleteFasts(ids=[...selectedFastIds],showConfirm=true){
    const targets=ids.map(id=>data.records.find(r=>r.id===id)).filter(Boolean); if(!targets.length)return false;
    if(showConfirm&&!confirm(t('bulk.deleteConfirm',{n:targets.length})))return false;
    const moves=[]; for(const r of targets){const m=moveFastToDeleted(r,'user');if(!m){moves.reverse().forEach(rollbackDeletedFastMove);return false;}moves.push(m);}
    if(!save()){moves.reverse().forEach(rollbackDeletedFastMove);renderAll();return false;}
    const movedIds=moves.map(m=>m.tombstone.id); selectedFastIds.clear(); renderAll();
    showUndoToast(t('bulk.deleted',{n:movedIds.length}),()=>{bulkRestoreDeletedFasts(movedIds,false);}); return true;
  }

  function bulkRestoreDeletedFasts(ids=[...selectedDeletedFastIds],showConfirm=true){
    const targets=ids.map(id=>data.deletedFasts.find(r=>r.id===id)).filter(Boolean); if(!targets.length)return false;
    if(showConfirm&&!confirm(t('bulk.restoreConfirm',{n:targets.length})))return false;
    if(targets.some(r=>data.records.some(x=>x.id===r.id))||!canRestoreFastBatch(targets)){alert(t('history.deletedRestoreOverlap'));return false;}
    const oldDeleted=data.deletedFasts.slice(),oldRecords=data.records.slice();
    const idsSet=new Set(targets.map(r=>r.id));data.deletedFasts=data.deletedFasts.filter(r=>!idsSet.has(r.id));
    data.records.push(...targets.map(deleted=>({id:deleted.id,start:deleted.start,end:deleted.end,goalHours:deleted.goalHours,timeZone:deleted.timeZone,createdAt:normalizeAuditTimestamp(deleted.createdAt),modifiedAt:normalizeAuditTimestamp(deleted.modifiedAt),editHistory:normalizeFastEditHistory(deleted.editHistory),stopReason:normalizeStopReason(deleted.stopReason)})));
    if(!save()){data.deletedFasts=oldDeleted;data.records=oldRecords;renderAll();return false;} selectedDeletedFastIds.clear();renderAll();return true;
  }

  function bulkPurgeDeletedFasts(ids=[...selectedDeletedFastIds]){const set=new Set(ids.filter(id=>data.deletedFasts.some(r=>r.id===id)));if(!set.size)return false;if(!confirm(t('bulk.purgeConfirm',{n:set.size}))||!confirm(t('bulk.purgeFinalConfirm',{n:set.size})))return false;const old=data.deletedFasts.slice();data.deletedFasts=data.deletedFasts.filter(r=>!set.has(r.id));if(!save({invalidateDerived:false,dirtyViews:['history','settings']})){data.deletedFasts=old;renderAll();return false;}selectedDeletedFastIds.clear();renderHistory();renderBackupStatus();return true;}

  function bulkDeleteWeights(ids=[...selectedWeightIds],showConfirm=true){const targets=ids.map(id=>data.weights.find(w=>w.id===id)).filter(Boolean);if(!targets.length)return false;if(showConfirm&&!confirm(t('bulk.deleteConfirm',{n:targets.length})))return false;const oldW=data.weights.slice(),oldD=data.deletedWeights.slice(),now=new Date().toISOString(),tz=currentTimeZone(),set=new Set(targets.map(w=>w.id));data.weights=data.weights.filter(w=>!set.has(w.id));data.deletedWeights.push(...targets.map(w=>({...w,deleted:true,deletedAt:now,deletedTimeZone:tz,deletionReason:'user'})));if(!save({invalidateDerived:true,dirtyViews:['weight','stats','settings','fasting']})){data.weights=oldW;data.deletedWeights=oldD;renderAll();return false;}const moved=[...set];selectedWeightIds.clear();renderAll();showUndoToast(t('bulk.deleted',{n:moved.length}),()=>bulkRestoreDeletedWeights(moved,false));return true;}
  function bulkRestoreDeletedWeights(ids=[...selectedDeletedWeightIds],showConfirm=true){const targets=ids.map(id=>data.deletedWeights.find(w=>w.id===id)).filter(Boolean);if(!targets.length)return false;if(showConfirm&&!confirm(t('bulk.restoreConfirm',{n:targets.length})))return false;if(targets.some(w=>data.weights.some(x=>x.id===w.id))){alert(t('weight.restoreConflict'));return false;}const restored=targets.map(normalizeWeightEntry);if(restored.some(x=>!x))return false;const oldW=data.weights.slice(),oldD=data.deletedWeights.slice(),set=new Set(targets.map(w=>w.id));data.deletedWeights=data.deletedWeights.filter(w=>!set.has(w.id));data.weights.push(...restored);if(!save({invalidateDerived:true,dirtyViews:['weight','stats','settings','fasting']})){data.weights=oldW;data.deletedWeights=oldD;renderAll();return false;}selectedDeletedWeightIds.clear();renderAll();return true;}
  function bulkPurgeDeletedWeights(ids=[...selectedDeletedWeightIds]){const set=new Set(ids.filter(id=>data.deletedWeights.some(w=>w.id===id)));if(!set.size)return false;if(!confirm(t('bulk.purgeConfirm',{n:set.size}))||!confirm(t('bulk.purgeFinalConfirm',{n:set.size})))return false;const old=data.deletedWeights.slice();data.deletedWeights=data.deletedWeights.filter(w=>!set.has(w.id));if(!save({invalidateDerived:false,dirtyViews:['weight','settings']})){data.deletedWeights=old;renderAll();return false;}selectedDeletedWeightIds.clear();renderWeight();return true;}

  function deletedFastAuditFromRecord(record, deletionReason = 'user') {
    return {
      id: record.id,
      start: record.start,
      end: record.end,
      goalHours: record.goalHours,
      timeZone: record.timeZone,
      createdAt: normalizeAuditTimestamp(record.createdAt),
      modifiedAt: normalizeAuditTimestamp(record.modifiedAt),
      editHistory: normalizeFastEditHistory(record.editHistory),
      stopReason: normalizeStopReason(record.stopReason),
      deleted: true,
      deletedAt: new Date().toISOString(),
      deletedTimeZone: currentTimeZone(),
      deletionReason
    };
  }

  function moveFastToDeleted(record, deletionReason = 'user') {
    if (!record || !Array.isArray(data.deletedFasts)) return null;
    const index = data.records.findIndex(r => r.id === record.id);
    if (index < 0 || data.deletedFasts.some(r => r.id === record.id)) return null;
    const tombstone = deletedFastAuditFromRecord(record, deletionReason);
    data.records.splice(index, 1);
    data.deletedFasts.push(tombstone);
    return { index, record, tombstone };
  }

  function rollbackDeletedFastMove(move) {
    if (!move) return;
    data.deletedFasts = data.deletedFasts.filter(r => r !== move.tombstone && r.id !== move.tombstone.id);
    data.records.splice(Math.min(move.index, data.records.length), 0, move.record);
  }

  function deleteFastToAudit(record, deletionReason = 'user') {
    const move = moveFastToDeleted(record, deletionReason);
    if (!move) return false;
    if (!save()) { rollbackDeletedFastMove(move); renderAll(); return false; }
    renderAll();
    return true;
  }

  function restoreDeletedFast(id) {
    const index = data.deletedFasts.findIndex(r => r.id === id);
    if (index < 0) return false;
    const deleted = data.deletedFasts[index];
    if (data.records.some(r => r.id === deleted.id)) { alert(t('history.deletedRestoreIdConflict')); return false; }
    const start = validDate(deleted.start), end = validDate(deleted.end);
    if (!start || !end || intervalOverlaps(start, end)) { alert(t('history.deletedRestoreOverlap')); return false; }
    const restored = {id:deleted.id,start:deleted.start,end:deleted.end,goalHours:deleted.goalHours,timeZone:deleted.timeZone,createdAt:normalizeAuditTimestamp(deleted.createdAt),modifiedAt:normalizeAuditTimestamp(deleted.modifiedAt),editHistory:normalizeFastEditHistory(deleted.editHistory),stopReason:normalizeStopReason(deleted.stopReason)};
    data.deletedFasts.splice(index, 1); data.records.push(restored);
    if (!save()) {data.records=data.records.filter(r=>r.id!==restored.id);data.deletedFasts.splice(Math.min(index,data.deletedFasts.length),0,deleted);renderAll();return false;}
    renderAll(); return true;
  }

  function permanentlyDeleteFast(id) {
    const index = data.deletedFasts.findIndex(r => r.id === id);
    if (index < 0 || !confirm(t('history.deletedPermanentConfirm')) || !confirm(t('history.deletedPermanentFinalConfirm'))) return;
    const [removed] = data.deletedFasts.splice(index, 1);
    if (!save({ invalidateDerived:false, dirtyViews:['history','settings'] })) {
      data.deletedFasts.splice(Math.min(index, data.deletedFasts.length), 0, removed);
      renderAll();
      return;
    }
    renderHistory();
    viewDirty.history = false;
    renderBackupStatus();
  }

  function deletionReasonLabel(reason) {
    return reason === 'backdate-conflict' ? t('history.deletedReasonBackdate') : t('history.deletedReasonUser');
  }

  function restoreFastEditVersion(recordId, historical) {
    const index=data.records.findIndex(r=>r.id===recordId); if(index<0)return false;
    const current=data.records[index], start=validDate(historical?.start), end=validDate(historical?.end); if(!start||!end||end<=start)return false;
    if(intervalOverlaps(start,end,recordId)){alert(t('history.errOverlap'));return false;}
    if(!confirm(t('history.restoreEditConfirm',{summary:fastEditSummary(historical)})))return false;
    const now=new Date().toISOString(), next={...current,start:start.toISOString(),end:end.toISOString(),goalHours:sanitizeGoal(historical.goalHours,data.goalHours),timeZone:normalizeTimeZone(historical.timeZone),stopReason:normalizeStopReason(historical.stopReason),modifiedAt:now,editHistory:[...normalizeFastEditHistory(current.editHistory),fastEditAuditEntry(current,now)].slice(-MAX_FAST_EDIT_AUDIT)};
    data.records[index]=next; if(!save()){data.records[index]=current;renderAll();return false;} hideModal('editAuditModal');renderAll();return true;
  }

  function openFastEditHistory(record) {
    const list=el('editAuditList'); list.replaceChildren();
    el('editAuditCurrent').textContent=t('history.editHistoryCurrent',{summary:fastEditSummary(record)});
    const history=normalizeFastEditHistory(record.editHistory), canRestore=data.records.some(r=>r.id===record.id);
    if(!history.length){const empty=document.createElement('div');empty.className='historyEmpty';empty.textContent=t('history.editHistoryEmpty');list.append(empty);}
    else history.slice().reverse().forEach((entry,index)=>{
      const row=document.createElement('div');row.className='auditEntry';
      const title=document.createElement('strong');title.textContent=t('history.editHistoryRevision',{n:history.length-index,date:localDateTimeLabel(entry.editedAt,entry.editedTimeZone)});
      const before=document.createElement('div');before.className='small';before.textContent=t('history.editHistoryPrevious',{summary:fastEditSummary(entry)});
      row.append(title,before);
      if(canRestore){const restore=document.createElement('button');restore.type='button';restore.className='secondary';restore.style.marginTop='8px';restore.textContent=t('history.restoreEditVersion');restore.addEventListener('click',()=>restoreFastEditVersion(record.id,entry));row.append(restore);}
      list.append(row);
    });
    showModal('editAuditModal','editAuditCloseBtn');
  }

  function appendEditedIndicator(parent, record) {
    if (!record?.modifiedAt) return;
    const latestAudit=Array.isArray(record.editHistory)&&record.editHistory.length?record.editHistory[record.editHistory.length-1]:null;
    const line=document.createElement('div');line.className='small';
    const button=document.createElement('button');button.type='button';button.className='textButton';button.textContent=t('history.editedAt',{date:localDateTimeLabel(record.modifiedAt,latestAudit?.editedTimeZone||currentTimeZone())});
    button.addEventListener('click',()=>openFastEditHistory(record)); line.append(button); parent.append(line);
  }

  function renderDeletedFasts() {
    const card=el('deletedFastsCard'),box=el('deletedFastsList'),spec=historyFilterSpec();
    const total=data.deletedFasts.length; card.hidden=!spec.includeDeleted||total===0; box.replaceChildren();
    if(!spec.includeDeleted||!total){updateBulkActionBars();return;}
    const deletedSorted=[...data.deletedFasts].sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt)));const filtered=historyFilterActive(spec)?deletedSorted.filter(r=>fastPassesHistoryFilter(r,spec)):deletedSorted;
    el('deletedFastsCount').textContent=t('history.deletedFilteredCount',{shown:filtered.length,total});
    const visible=filtered.slice(0,deletedHistoryVisibleCount);
    if(!visible.length){const empty=document.createElement('div');empty.className='historyEmpty';empty.textContent=t('history.filterNoMatch');box.append(empty);}
    for(const r of visible){
      const row=document.createElement('div');row.className='row historyRow'+(historyBulkMode?' bulkSelectable':'');
      if(historyBulkMode)row.append(bulkCheckbox(r.id,selectedDeletedFastIds,t('bulk.selectFast',{date:localDateLabel(r.end,r.timeZone)})));
      const left=document.createElement('div');left.style.minWidth='0';const strong=document.createElement('strong');strong.textContent=localDateLabel(r.end,r.timeZone);left.append(strong);
      const times=document.createElement('div');times.className='small';times.textContent=`${localDateTimeLabel(r.start,r.timeZone)} → ${localDateTimeLabel(r.end,r.timeZone)}`;left.append(times);
      const targetLine=document.createElement('div');targetLine.className='small';targetLine.textContent=t('history.target',{goal:formatGoal(r.goalHours??data.goalHours)});left.append(targetLine);appendEditedIndicator(left,r);if(isExcusedStop(r)){const badge=document.createElement('div');badge.className='excusedBadge';badge.textContent=t('history.excusedStop',{reason:stopReasonLabel(r.stopReason)});left.append(badge);}
      const deletedLine=document.createElement('div');deletedLine.className='small';deletedLine.textContent=t('history.deletedAt',{date:localDateTimeLabel(r.deletedAt,r.deletedTimeZone),reason:deletionReasonLabel(r.deletionReason)});left.append(deletedLine);
      const right=document.createElement('div');right.style.textAlign='right';right.style.flex='0 0 auto';const dur=document.createElement('div');dur.className='duration';dur.textContent=friendlyDuration(recordMs(r));right.append(dur);
      if(!historyBulkMode){const actions=document.createElement('div');actions.className='historyActions';const restore=document.createElement('button');restore.className='secondary';restore.textContent=t('history.deletedRestore');restore.addEventListener('click',()=>restoreDeletedFast(r.id));const permanent=document.createElement('button');permanent.className='dangerText';permanent.textContent=t('history.deletedPermanent');permanent.addEventListener('click',()=>permanentlyDeleteFast(r.id));actions.append(restore,permanent);right.append(actions);}
      row.append(left,right);box.append(row);
    }
    if(visible.length<filtered.length){const wrap=document.createElement('div');wrap.className='loadMoreWrap';const more=document.createElement('button');more.className='secondary';more.textContent=t('common.loadMoreCount',{n:filtered.length-visible.length});more.addEventListener('click',()=>{deletedHistoryVisibleCount+=HISTORY_PAGE_SIZE;renderDeletedFasts();});wrap.append(more);box.append(wrap);}
    updateBulkActionBars();
  }

  function renderHistory() {
    const box=el('historyList'),spec=historyFilterSpec();box.replaceChildren();
    const allSorted=sortedRecordsDesc();const filtered=historyFilterActive(spec)?allSorted.filter(r=>fastPassesHistoryFilter(r,spec)):allSorted;
    if(filtered.length<=7){historyRange='recent7';historyRangeMenuOpen=false;}
    const visible=fastHistoryRecordsForDisplay(filtered);
    const status=el('historyFilterStatus');if(status)status.textContent=t('history.filterCount',{shown:filtered.length,total:data.records.length});
    const controls=el('fastHistoryControls'),countLabel=el('historyVisibleCount'),moreBtn=el('historyMoreBtn'),rangeSelect=el('historyRange');
    if(countLabel)countLabel.textContent=t('history.lastCount',{n:visible.length});
    if(controls&&moreBtn&&rangeSelect){
      controls.hidden=filtered.length<=7;
      moreBtn.textContent=historyRange==='recent7'?(historyRangeMenuOpen?t('history.rangeClose'):t('history.rangeMore')):t('history.rangeRecent');
      moreBtn.setAttribute('aria-expanded',String(historyRangeMenuOpen));
      rangeSelect.hidden=!historyRangeMenuOpen;
      rangeSelect.value=historyRange==='recent7'?'':historyRange;
    }
    if(!visible.length){
      const empty=document.createElement('div');empty.className='historyEmpty';
      empty.textContent=historyRange!=='recent7'?t('history.rangeEmpty'):(data.records.length?t('history.filterNoMatch'):t('history.empty'));
      box.append(empty);renderDeletedFasts();updateBulkActionBars();return;
    }
    for(const r of visible){
      const row=document.createElement('div');row.className='row historyRow'+(historyBulkMode?' bulkSelectable':'');
      if(historyBulkMode)row.append(bulkCheckbox(r.id,selectedFastIds,t('bulk.selectFast',{date:localDateLabel(r.end,r.timeZone)})));
      const left=document.createElement('div');left.style.minWidth='0';const strong=document.createElement('strong');strong.textContent=localDateLabel(r.end,r.timeZone);left.append(strong);
      const times=document.createElement('div');times.className='small';times.textContent=`${localDateTimeLabel(r.start,r.timeZone)} → ${localDateTimeLabel(r.end,r.timeZone)}`;left.append(times);
      const targetLine=document.createElement('div');targetLine.className='small';targetLine.textContent=t('history.target',{goal:formatGoal(r.goalHours??data.goalHours)});left.append(targetLine);appendEditedIndicator(left,r);if(recordMetGoal(r)){const badge=document.createElement('div');badge.className='goalBadge';badge.textContent=t('history.targetReached');left.append(badge);}else if(isExcusedStop(r)){const badge=document.createElement('div');badge.className='excusedBadge';badge.textContent=t('history.excusedStop',{reason:stopReasonLabel(r.stopReason)});left.append(badge);}
      const right=document.createElement('div');right.style.textAlign='right';right.style.flex='0 0 auto';const dur=document.createElement('div');dur.className='duration';dur.textContent=friendlyDuration(recordMs(r));right.append(dur);const exactHours=recordMs(r)/3600000;const exact=document.createElement('div');exact.className='small';exact.textContent=`${formatNumber(exactHours,0,2)}${t('unit.h')}`;right.append(exact);
      if(!historyBulkMode){const actions=document.createElement('div');actions.className='historyActions';const edit=document.createElement('button');edit.className='secondary';edit.textContent=t('common.edit');edit.addEventListener('click',()=>openEntryModal(r));const del=document.createElement('button');del.className='dangerText';del.textContent=t('common.delete');del.addEventListener('click',()=>{if(confirm(t('history.deleteConfirm'))&&deleteFastToAudit(r, 'user'))showUndoToast(t('history.deletedUndo'),()=>restoreDeletedFast(r.id));});actions.append(edit,del);right.append(actions);}
      row.append(left,right);box.append(row);
    }
    renderDeletedFasts();updateBulkActionBars();
  }

