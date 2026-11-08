  function setWeightPeriodMode(mode) {
    if (!WEIGHT_PERIOD_MODES.includes(mode) || mode === weightPeriodMode) return;
    weightPeriodMode = mode;
    weightChartSelectedId = null;
    weightChartScrollToLatestPending = true;
    const asc = sortedWeightsAsc();
    renderWeightPeriodAnalytics(asc);
    drawWeightChart(asc);
    renderDeletedWeights();
  }

  function softDeleteWeightById(id, reason = 'user') {
    const index=data.weights.findIndex(w=>w.id===id);if(index<0||data.deletedWeights.some(w=>w.id===id))return false;
    const original=data.weights[index],tombstone={...original,deleted:true,deletedAt:new Date().toISOString(),deletedTimeZone:currentTimeZone(),deletionReason:String(reason||'user').slice(0,80)};
    data.weights.splice(index,1);data.deletedWeights.push(tombstone);if(!save({invalidateDerived:true,dirtyViews:['weight','stats','settings','fasting']})){data.deletedWeights=data.deletedWeights.filter(w=>w!==tombstone);data.weights.splice(index,0,original);return false;}return true;
  }
  function restoreDeletedWeightById(id){const index=data.deletedWeights.findIndex(w=>w.id===id);if(index<0)return false;const deleted=data.deletedWeights[index];if(data.weights.some(w=>w.id===deleted.id)){alert(t('weight.restoreConflict'));return false;}const restored=normalizeWeightEntry(deleted);if(!restored)return false;data.deletedWeights.splice(index,1);data.weights.push(restored);if(!save({invalidateDerived:true,dirtyViews:['weight','stats','settings','fasting']})){data.weights=data.weights.filter(w=>w!==restored&&w.id!==restored.id);data.deletedWeights.splice(index,0,deleted);return false;}return true;}
  function permanentlyDeleteWeightById(id){const index=data.deletedWeights.findIndex(w=>w.id===id);if(index<0)return false;const [removed]=data.deletedWeights.splice(index,1);if(!save({invalidateDerived:false,dirtyViews:['weight','settings']})){data.deletedWeights.splice(index,0,removed);return false;}return true;}
  function renderDeletedWeights(){
    const card=el('deletedWeightsCard'),box=el('deletedWeightsList'),spec=weightFilterSpec();if(!card||!box)return;const total=data.deletedWeights.length;card.hidden=!spec.includeDeleted||!total;box.replaceChildren();if(!spec.includeDeleted||!total){updateBulkActionBars();return;}
    const deletedSorted=[...data.deletedWeights].sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt)));const filtered=weightFilterActive(spec)?deletedSorted.filter(w=>weightPassesFilter(w,spec)):deletedSorted;el('deletedWeightsCount').textContent=t('weight.deletedFilteredCount',{shown:filtered.length,total});const visible=filtered.slice(0,HISTORY_PAGE_SIZE);
    if(!visible.length){const empty=document.createElement('div');empty.className='historyEmpty';empty.textContent=t('history.filterNoMatch');box.append(empty);}
    for(const w of visible){const row=document.createElement('div');row.className='row historyRow'+(weightBulkMode?' bulkSelectable':'');if(weightBulkMode)row.append(bulkCheckbox(w.id,selectedDeletedWeightIds,t('bulk.selectWeight',{date:localDateLabel(w.when,w.timeZone)})));const left=document.createElement('div');const strong=document.createElement('strong');strong.textContent=`${localDateTimeLabel(w.when,w.timeZone)} • ${formatWeight(w.kg,data.weightUnit)}`;const small=document.createElement('div');small.className='small';small.textContent=t('weight.deletedAt',{date:localDateTimeLabel(w.deletedAt,w.deletedTimeZone)});left.append(strong,small);const actions=document.createElement('div');actions.className='historyActions';if(!weightBulkMode){const restore=document.createElement('button');restore.className='secondary';restore.textContent=t('common.restore');restore.addEventListener('click',()=>{if(restoreDeletedWeightById(w.id))renderWeight();});const purge=document.createElement('button');purge.className='dangerText';purge.textContent=t('weight.deletePermanently');purge.addEventListener('click',()=>{if(confirm(t('weight.deletePermanentConfirm'))&&confirm(t('weight.deletePermanentFinalConfirm'))&&permanentlyDeleteWeightById(w.id))renderWeight();});actions.append(restore,purge);}row.append(left,actions);box.append(row);}updateBulkActionBars();
  }

  function renderWeight() {
    const unit = data.weightUnit;
    el('unitKgBtn').classList.toggle('active', unit === 'kg');
    el('unitLbBtn').classList.toggle('active', unit === 'lb');
    el('unitKgBtn').setAttribute('aria-pressed', String(unit === 'kg'));
    el('unitLbBtn').setAttribute('aria-pressed', String(unit === 'lb'));
    el('weightTargetUnit').textContent = unit;
    const targetShown = data.targetWeightKg == null ? '' : formatNumber(kgToDisplay(data.targetWeightKg, unit), 1, 1);
    if (document.activeElement !== el('weightTargetInput')) el('weightTargetInput').value = targetShown;

    const asc = sortedWeightsAsc();
    const latest = asc.length ? asc[asc.length - 1] : null;
    const first = asc.length ? asc[0] : null;
    el('wLatest').textContent = latest ? formatWeight(latest.kg, unit) : '—';
    el('wChange').textContent = latest && first ? formatWeight(latest.kg - first.kg, unit, true) : '—';
    el('wTarget').textContent = data.targetWeightKg == null ? '—' : formatWeight(data.targetWeightKg, unit);
    el('wToTarget').textContent = latest && data.targetWeightKg != null ? formatWeight(latest.kg - data.targetWeightKg, unit, true) : '—';

    const box=el('weightHistoryList');box.replaceChildren();const spec=weightFilterSpec();const allDesc=[...asc].reverse();const sortedDesc=weightFilterActive(spec)?allDesc.filter(w=>weightPassesFilter(w,spec)):allDesc;const filterStatus=el('weightFilterStatus');if(filterStatus)filterStatus.textContent=t('history.filterCount',{shown:sortedDesc.length,total:asc.length});
    if(!sortedDesc.length){const empty=document.createElement('div');empty.className='historyEmpty';empty.textContent=asc.length?t('history.filterNoMatch'):t('weight.empty');box.append(empty);}else{const visibleWeights=sortedDesc.slice(0,weightVisibleCount);visibleWeights.forEach(w=>{const row=document.createElement('div');row.className='row historyRow'+(weightBulkMode?' bulkSelectable':'');if(weightBulkMode)row.append(bulkCheckbox(w.id,selectedWeightIds,t('bulk.selectWeight',{date:localDateLabel(w.when,w.timeZone)})));const left=document.createElement('div');left.style.minWidth='0';const strong=document.createElement('strong');strong.textContent=localDateLabel(w.when,w.timeZone);left.append(strong);const when=document.createElement('div');when.className='small';when.textContent=localDateTimeLabel(w.when,w.timeZone);left.append(when);const right=document.createElement('div');right.style.textAlign='right';right.style.flex='0 0 auto';const val=document.createElement('div');val.className='duration';val.textContent=formatWeight(w.kg,unit);right.append(val);if(!weightBulkMode){const actions=document.createElement('div');actions.className='historyActions';const edit=document.createElement('button');edit.className='secondary';edit.textContent=t('common.edit');bindResponsiveAction(edit, () => openWeightModal(w));const del=document.createElement('button');del.className='dangerText';del.textContent=t('common.delete');bindResponsiveAction(del, () => {if(!confirm(t('weight.deleteConfirm')))return;if(!softDeleteWeightById(w.id,'user')){renderAll();return;}renderWeight();showUndoToast(t('weight.deletedUndo'),()=>{if(restoreDeletedWeightById(w.id))renderWeight();});});actions.append(edit,del);right.append(actions);}row.append(left,right);box.append(row);});if(visibleWeights.length<sortedDesc.length){const wrap=document.createElement('div');wrap.className='loadMoreWrap';const more=document.createElement('button');more.className='secondary';more.textContent=t('common.loadMoreCount',{n:sortedDesc.length-visibleWeights.length});more.addEventListener('click',()=>{weightVisibleCount+=HISTORY_PAGE_SIZE;renderWeight();});wrap.append(more);box.append(wrap);}}
    renderWeightPeriodAnalytics(asc);
    drawWeightChart(asc);
    renderDeletedWeights();
  }


  function renderWeightChartData() {
    const box=el('weightChartData'),btn=el('weightChartDataBtn'); if(!box||box.hidden)return;
    const scroller=el('weightChartScroller'), buckets=weightChartBuckets; box.replaceChildren();
    if(!buckets.length){box.textContent=t('a11y.noChartData');return;}
    const viewport=Math.max(1,scroller?.clientWidth||600), scroll=scroller?.scrollLeft||0;
    const spacing=weightPeriodMode==='daily'?(buckets.length<=30?Math.max(1,(viewport-30)/Math.max(1,buckets.length-1)):Math.max(10,Math.min(22,(viewport-30)/29))):(buckets.length<=5?Math.max(1,(viewport-30)/Math.max(1,buckets.length-1)):68);
    const first=Math.max(0,Math.floor((scroll-16)/Math.max(1,spacing))-1), last=Math.min(buckets.length-1,Math.ceil((scroll+viewport-16)/Math.max(1,spacing))+1);
    const ul=document.createElement('ul');
    for(let i=last;i>=first;i--){const b=buckets[i];if(!b.count)continue;const li=document.createElement('li');li.textContent=`${weightBucketLongLabel(b)} — ${formatWeight(b.averageKg,data.weightUnit)}${b.count>1?` • ${b.count} ${t(pluralKey('weight.measurement',b.count))}`:''}`;ul.append(li);} box.append(ul);
  }
  function setWeightUnit(unit) {
    data.weightUnit = normalizeWeightUnit(unit);
    save({ invalidateDerived:false, dirtyViews:['weight','stats','settings'] });
    renderWeight();
    viewDirty.weight = false;
  }

  function setTargetWeightFromInput() {
    const raw = el('weightTargetInput').value.trim();
    if (!raw) {
      data.targetWeightKg = null;
      save({ invalidateDerived:false, dirtyViews:['weight','stats','settings'] }); renderWeight(); viewDirty.weight = false; return;
    }
    const kg = sanitizeWeightKg(displayToKg(parseLocalizedNumber(raw), data.weightUnit), null);
    if (kg == null) {
      alert(t('weight.errTarget', {unit:data.weightUnit}));
      renderWeight(); return;
    }
    data.targetWeightKg = kg;
    save({ invalidateDerived:false, dirtyViews:['weight','stats','settings'] }); renderWeight(); viewDirty.weight = false;
  }

