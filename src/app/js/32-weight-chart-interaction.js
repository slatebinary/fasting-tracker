  function drawWeightChartYAxis(minV, maxV) {
    const c = el('weightChartYAxis');
    if (!c) return;
    const ratio = window.devicePixelRatio || 1, cssW = 46, cssH = 240;
    c.width = Math.floor(cssW * ratio); c.height = Math.floor(cssH * ratio);
    c.style.width = `${cssW}px`; c.style.height = `${cssH}px`;
    const ctx = c.getContext('2d'); ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,cssW,cssH);
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
    const top=18,bottom=38,h=cssH-top-bottom,span=maxV-minV||1;
    ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='right';ctx.textBaseline='middle';
    [0,.5,1].forEach(frac=>{const y=top+h-h*frac;ctx.fillText(formatNumber(minV+span*frac,1,1),40,y);});
  }

  function drawWeightChart(asc = null) {
    const c = el('weightChart'), scroller = el('weightChartScroller'), track = el('weightChartTrack');
    if (!c || !scroller || !track) return;
    const aggregatedBuckets = buildWeightAggregateBuckets(Array.isArray(asc) ? asc : null, weightPeriodMode);
    // Aggregate views omit empty calendar intervals. Empty weeks/months create
    // blank columns and force scrolling when only a few periods contain data.
    const buckets = weightPeriodMode === 'daily' ? aggregatedBuckets : aggregatedBuckets.filter(bucket => bucket.count > 0);
    weightChartBuckets = buckets;
    const viewportW = Math.max(220, scroller.clientWidth || 614), cssH = 240;
    const ratio = window.devicePixelRatio || 1;
    c.style.width = `${viewportW}px`; c.style.height = `${cssH}px`;
    c.width = Math.floor(viewportW * ratio); c.height = Math.floor(cssH * ratio);
    const ctx = c.getContext('2d'); ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,viewportW,cssH);

    const chartNote = el('weightChartNote');
    if (chartNote) chartNote.textContent = weightPeriodMode === 'daily' ? t('weight.chartHelp') : weightChartStyle === 'fixed' ? t('weight.fixedChartHelp') : t('weight.rollingChartHelp',{days:weightRollingWindowDays(weightPeriodMode)});
    const detail = el('weightChartDetail');
    weightChartHitPoints = [];
    const style = getComputedStyle(document.documentElement);
    const line=style.getPropertyValue('--line').trim(), accent=style.getPropertyValue('--accent').trim(), muted=style.getPropertyValue('--muted').trim();
    const good=style.getPropertyValue('--good').trim(), card=style.getPropertyValue('--card').trim(), textColor=style.getPropertyValue('--text').trim();
    const unit=data.weightUnit;

    if (!buckets.length) {
      track.style.width='100%'; weightChartSelectedId=null;
      if(detail){detail.hidden=true;detail.textContent='';}
      drawWeightChartYAxis(0,1);
      ctx.fillStyle=muted;ctx.font='13px -apple-system';ctx.textAlign='center';ctx.fillText(t('weight.addChart'),viewportW/2,cssH/2);ctx.textAlign='start';syncWeightChartNavigator();return;
    }

    const dataBuckets=weightPeriodMode==='daily'?buckets:buckets.filter(b=>b.count>0);
    if (weightChartSelectedId && !dataBuckets.some(b=>b.key===weightChartSelectedId)) weightChartSelectedId=null;
    const target=data.targetWeightKg==null?null:kgToDisplay(data.targetWeightKg,unit);
    const scaleKey=`${Number(data.revision)||0}|${weightPeriodMode}|${unit}|${target==null?'none':target}`;
    let minV,maxV,span;
    if(weightChartScaleCache?.key===scaleKey){({minV,maxV,span}=weightChartScaleCache);}
    else {
      minV=Infinity;maxV=-Infinity;
      for(const bucket of dataBuckets){const v=kgToDisplay(bucket.averageKg,unit);if(v<minV)minV=v;if(v>maxV)maxV=v;}
      if(target!=null){if(target<minV)minV=target;if(target>maxV)maxV=target;}
      span=maxV-minV;
      const padV=span>0?Math.max(span*.15,unit==='lb'?2:1):(unit==='lb'?5:2);minV-=padV;maxV+=padV;span=maxV-minV||1;
      weightChartScaleCache={key:scaleKey,minV,maxV,span};
    }
    drawWeightChartYAxis(minV,maxV);

    const top=18,bottom=38,left=16,right=14,plotW=Math.max(1,viewportW-left-right),h=cssH-top-bottom;
    const dailySpacing=buckets.length<=30
      ? Math.max(1,plotW/Math.max(1,buckets.length-1))
      : Math.max(10,Math.min(22,plotW/29));
    // Every non-daily mode is a rolling series sampled on actual measurement
    // dates. Keep the same dense, scrollable navigation model as Daily.
    const pointSpacing=dailySpacing;
    const virtualPlotW=Math.max(plotW,(buckets.length-1)*pointSpacing);
    const trackW=Math.ceil(left+virtualPlotW+right);
    track.style.width=`${Math.max(viewportW,trackW)}px`;
    scroller.dataset.period = weightPeriodMode;
    scroller.dataset.bucketCount = String(buckets.length);
    scroller.dataset.dataPointCount = String(dataBuckets.length);
    scroller.dataset.rollingWindowDays = String(weightRollingWindowDays(weightPeriodMode));
    delete scroller.dataset.selectedWindowCount;
    delete scroller.dataset.selectedCalendarCount;
    if(weightChartScrollToLatestPending){scroller.scrollLeft=Math.max(0,scroller.scrollWidth-scroller.clientWidth);weightChartProgrammaticScrollLeft=scroller.scrollLeft;for(let i=buckets.length-1;i>=0;i--){if(buckets[i].count>0){weightChartSelectedId=buckets[i].key;break;}}weightChartScrollToLatestPending=false;}
    const scrollX=scroller.scrollLeft;
    const yFor=v=>top+h-((v-minV)/span)*h;
    const absoluteX=i=>left+(buckets.length===1?plotW/2:i*pointSpacing);
    const xFor=i=>absoluteX(i)-scrollX;

    ctx.strokeStyle=line;ctx.lineWidth=1;
    [0,.5,1].forEach(frac=>{const y=top+h-h*frac;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(viewportW,y);ctx.stroke();});
    if(target!=null){const y=yFor(target);ctx.save();ctx.strokeStyle=good;ctx.setLineDash([5,4]);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(viewportW,y);ctx.stroke();ctx.restore();}

    const firstVisible=Math.max(0,Math.floor((scrollX-left)/Math.max(1,pointSpacing))-2);
    const lastVisible=Math.min(buckets.length-1,Math.ceil((scrollX+viewportW-left)/Math.max(1,pointSpacing))+2);
    ctx.strokeStyle=accent;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';
    let pathOpen=false;
    ctx.beginPath();
    for(let i=Math.max(0,firstVisible-1);i<=Math.min(buckets.length-1,lastVisible+1);i++){
      const bucket=buckets[i];
      if(!bucket.count){pathOpen=false;continue;}
      const x=xFor(i),y=yFor(kgToDisplay(bucket.averageKg,unit));
      if(!pathOpen){ctx.moveTo(x,y);pathOpen=true;}else ctx.lineTo(x,y);
    }
    ctx.stroke();

    const weightMarkerEvery=Math.max(1,Math.ceil(16/Math.max(1,pointSpacing)));
    ctx.fillStyle=accent;
    for(let i=firstVisible;i<=lastVisible;i++){
      const bucket=buckets[i]; if(!bucket.count) continue;
      const value=kgToDisplay(bucket.averageKg,unit),x=xFor(i),y=yFor(value);
      if(x < -28 || x > viewportW+28) continue;
      weightChartHitPoints.push({id:bucket.key,bucket,x,y,value});
      const selected=bucket.key===weightChartSelectedId;if(selected||i%weightMarkerEvery===0||i===lastVisible||i===buckets.length-1){ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();}
    }

    const selectedIndex=buckets.findIndex(b=>b.key===weightChartSelectedId&&b.count>0);
    if(selectedIndex>=0){
      const bucket=buckets[selectedIndex],x=xFor(selectedIndex),value=kgToDisplay(bucket.averageKg,unit),y=yFor(value);
      if(x>=-18&&x<=viewportW+18){
        drawSelectionCrosshair(ctx,x,top,top+h,muted);
        ctx.save();ctx.fillStyle='#fff';ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,6.5,0,Math.PI*2);ctx.fill();ctx.stroke();
        const valueLabel=formatWeight(bucket.averageKg,unit),periodLabel=weightPointCalloutPeriod(bucket);
        const textScale=Math.max(1,Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ft-text-scale'))||1);
        const valueFontSize=Math.max(13,12*textScale),periodFontSize=Math.max(12,11*textScale);
        ctx.font='600 '+valueFontSize+'px -apple-system';const valueW=ctx.measureText(valueLabel).width;
        ctx.font=periodFontSize+'px -apple-system';const periodW=ctx.measureText(periodLabel).width;
        const labelW=Math.min(viewportW-8,Math.max(82,Math.ceil(Math.max(valueW,periodW))+22));
        const labelH=Math.ceil(valueFontSize*1.35+periodFontSize*1.35+10);
        const bx=Math.max(4,Math.min(viewportW-labelW-4,x-labelW/2));
        const by=y>labelH+18?y-labelH-10:Math.min(cssH-labelH-4,y+12);
        ctx.fillStyle=card;ctx.strokeStyle=accent;ctx.lineWidth=1.5;ctx.beginPath();if(typeof ctx.roundRect==='function')ctx.roundRect(bx,by,labelW,labelH,7);else ctx.rect(bx,by,labelW,labelH);ctx.fill();ctx.stroke();
        ctx.fillStyle=textColor;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 '+valueFontSize+'px -apple-system';ctx.fillText(valueLabel,bx+labelW/2,by+valueFontSize*.78+3);
        ctx.fillStyle=textColor;ctx.font=periodFontSize+'px -apple-system';ctx.fillText(periodLabel,bx+labelW/2,by+valueFontSize+periodFontSize*.8+5);ctx.restore();
      }
      scroller.dataset.selectedWindowCount = String(bucket.count);
      scroller.dataset.selectedCalendarCount = String(bucket.calendarBucket?.count || 0);
      if(detail){
        detail.replaceChildren();
        if(weightPeriodMode==='daily'&&bucket.entry) detail.textContent=t('weight.pointDetail',{weight:formatWeight(bucket.entry.kg,unit),date:localDateTimeLabel(bucket.entry.when,bucket.entry.timeZone)});
        else {
          const addDetailGroup=(kind,title,value,meta)=>{
            const group=document.createElement('div');group.className='weightPointDetailGroup '+kind;
            const heading=document.createElement('div');heading.className='weightPointDetailHeading';
            const label=document.createElement('strong');label.textContent=title;
            const amount=document.createElement('span');amount.className='weightPointDetailValue';amount.textContent=value;
            heading.append(label,amount);group.append(heading);
            if(meta){const note=document.createElement('div');note.className='weightPointDetailMeta';note.textContent=meta;group.append(note);}
            detail.append(group);
          };
          const count=bucket.count,measurementWord=t(pluralKey('weight.measurement',count));
          const periodName=(weightPeriodMode==='week'?t('weight.periodWeek'):weightPeriodMode==='month'?t('weight.periodMonth'):weightPeriodMode==='quarter'?t('weight.periodQuarter'):weightPeriodMode==='halfyear'?t('weight.periodHalfYear'):t('weight.periodYear')).toLocaleLowerCase(currentLocale());
          const calendar=bucket.calendarBucket;
          if(weightChartStyle==='fixed'){
            addDetailGroup('primary',t('weight.calendarAverageTitle',{period:periodName}),formatWeight(bucket.averageKg,unit),t('weight.calendarAverageMeta',{periodLabel:weightBucketLongLabel(bucket,weightPeriodMode),count:formatNumber(count),measurementWord}));
          }else{
            addDetailGroup('primary',t('weight.rollingAverageTitle',{days:bucket.rollingWindowDays}),formatWeight(bucket.averageKg,unit),t('weight.rollingAverageMeta',{date:weightBucketLongLabel(bucket),count:formatNumber(count),measurementWord,days:bucket.rollingWindowDays}));
            if(calendar&&calendar.count){
              addDetailGroup('context',t('weight.calendarAverageTitle',{period:periodName}),formatWeight(calendar.averageKg,unit),t('weight.calendarAverageMeta',{periodLabel:weightBucketLongLabel(calendar,weightPeriodMode),count:formatNumber(calendar.count),measurementWord:t(pluralKey('weight.measurement',calendar.count))}));
            }
          }
        }
        detail.hidden=false;
      }
    } else if(detail){detail.hidden=true;detail.textContent='';}

    ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='center';ctx.textBaseline='alphabetic';
    const visibleAxisItems=[],visibleAxisPositions=[];for(let i=firstVisible;i<=lastVisible;i++){const x=xFor(i);if(x<8||x>viewportW-8)continue;const label=weightBucketShortLabel(buckets[i]);visibleAxisItems.push({label,shortLabel:label,index:i});visibleAxisPositions.push(x);}
    const axisPlan=FTVisuals.axisLabelPlan(visibleAxisItems,{positions:visibleAxisPositions,measureText:text=>ctx.measureText(String(text)).width,maxLabels:Math.max(2,Math.floor(viewportW/62)),minGap:7});
    for(const tick of axisPlan){const text=String(tick.text),tw=ctx.measureText(text).width,x=Math.max(4+tw/2,Math.min(viewportW-4-tw/2,tick.x));ctx.fillText(text,x,cssH-10);}
    ctx.textAlign='start';
    syncWeightChartNavigator();
  }

  function weightChartPointAt(clientX,clientY){
    const c=el('weightChart');if(!c||!weightChartHitPoints.length)return null;const rect=c.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top;let best=null,bestDistance=Infinity;
    for(const point of weightChartHitPoints){const distance=Math.hypot(x-point.x,y-point.y);if(distance<bestDistance){best=point;bestDistance=distance;}}
    return bestDistance<=28?best:null;
  }
  function selectWeightChartPointAtX(clientX){
    const c=el('weightChart');if(!c||!weightChartHitPoints.length)return null;
    const x=clientX-c.getBoundingClientRect().left;let best=null,distance=Infinity;
    for(const point of weightChartHitPoints){const d=Math.abs(x-point.x);if(d<distance){distance=d;best=point;}}
    return best&&distance<=Math.max(32,(c.clientWidth||220)/Math.max(1,weightChartHitPoints.length)*1.5)?best:null;
  }
  function weightChartPointSpacing(){
    const scroller=el('weightChartScroller'),buckets=weightChartBuckets,viewportW=Math.max(220,scroller?.clientWidth||614),plotW=Math.max(1,viewportW-30);
    return buckets.length<=30?Math.max(1,plotW/Math.max(1,buckets.length-1)):Math.max(10,Math.min(22,plotW/29));
  }
  function syncWeightChartNavigator(){
    const slider=el('weightChartRange'),older=el('weightChartOlderBtn'),newer=el('weightChartNewerBtn'),scroller=el('weightChartScroller');
    if(!slider||!older||!newer||!scroller)return;
    const buckets=weightChartBuckets,valid=buckets.filter(b=>b.count>0);
    slider.max=String(Math.max(0,buckets.length-1));
    const selectedIndex=buckets.findIndex(b=>b.key===weightChartSelectedId);
    slider.value=String(Math.max(0,selectedIndex));
    slider.disabled=valid.length<2;
    const selectedValidIndex=valid.findIndex(b=>b.key===weightChartSelectedId);
    older.disabled=valid.length<2||selectedValidIndex===0;
    newer.disabled=valid.length<2||selectedValidIndex===valid.length-1;
    const bucket=buckets[selectedIndex];
    slider.setAttribute('aria-valuetext',bucket&&bucket.count ? weightBucketLongLabel(bucket)+' — '+formatWeight(bucket.averageKg,data.weightUnit) : '');
  }
  function nearestWeightBucketIndex(index){
    const buckets=weightChartBuckets;
    index=Math.max(0,Math.min(buckets.length-1,Math.round(Number(index)||0)));
    if(buckets[index]?.count)return index;
    for(let distance=1;distance<buckets.length;distance++){
      if(buckets[index-distance]?.count)return index-distance;
      if(buckets[index+distance]?.count)return index+distance;
    }
    return -1;
  }
  function navigateWeightChartToIndex(index){
    const scroller=el('weightChartScroller'),buckets=weightChartBuckets;
    if(!scroller||!buckets.length)return;
    const targetIndex=nearestWeightBucketIndex(index);
    if(targetIndex<0)return;
    weightChartSelectedId=buckets[targetIndex].key;
    const spacing=weightChartPointSpacing(),pointX=16+targetIndex*spacing;
    weightChartProgrammaticScrollLeft=Math.max(0,Math.min(scroller.scrollWidth-scroller.clientWidth,pointX-scroller.clientWidth/2));
    scroller.scrollLeft=weightChartProgrammaticScrollLeft;
    drawWeightChart();
    renderWeightChartData();
    renderWeightPeriodAnalytics();
    syncWeightChartNavigator();
  }
  function shiftWeightChartViewport(direction){
    const scroller=el('weightChartScroller'),buckets=weightChartBuckets;
    if(!scroller||!buckets.length)return;
    const valid=buckets.filter(b=>b.count>0);
    if(valid.length<2)return;
    let current=valid.findIndex(b=>b.key===weightChartSelectedId);
    if(current<0){
      const spacing=weightChartPointSpacing(),center=scroller.scrollLeft+scroller.clientWidth/2;
      let bestDistance=Infinity;
      valid.forEach((bucket,i)=>{
        const bucketIndex=buckets.findIndex(b=>b.key===bucket.key),pointX=16+bucketIndex*spacing;
        const distance=Math.abs(pointX-center);
        if(distance<bestDistance){bestDistance=distance;current=i;}
      });
    }
    const target=Math.max(0,Math.min(valid.length-1,current+(direction<0?-1:1)));
    if(target===current){syncWeightChartNavigator();return;}
    navigateWeightChartToIndex(buckets.findIndex(b=>b.key===valid[target].key));
  }
  function beginWeightChartPointer(event){
    if(event.button!=null&&event.button!==0)return;
    weightChartPointerStart={id:event.pointerId,x:event.clientX,y:event.clientY,scrollLeft:el('weightChartScroller')?.scrollLeft||0};
  }
  function finishWeightChartPointer(event){
    const start=weightChartPointerStart;weightChartPointerStart=null;
    if(!start||start.id!==event.pointerId)return;
    if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>10||Math.abs((el('weightChartScroller')?.scrollLeft||0)-start.scrollLeft)>8)return;
    const point=weightChartPointAt(event.clientX,event.clientY);if(!point)return;
    weightChartSelectedId=point.id;drawWeightChart();renderWeightChartData();renderWeightPeriodAnalytics();syncWeightChartNavigator();
  }
  function cancelWeightChartPointer(){weightChartPointerStart=null;}

  function handleWeightChartScroll(){
    if(weightChartScrollFrame)return;
    weightChartScrollFrame=requestAnimationFrame(()=>{
      weightChartScrollFrame=0;
      const scroller=el('weightChartScroller'),buckets=weightChartBuckets;
      const programmaticScroll=scroller&&weightChartProgrammaticScrollLeft!==null&&Math.abs(scroller.scrollLeft-weightChartProgrammaticScrollLeft)<=2;
      if(scroller&&weightChartProgrammaticScrollLeft!==null&&!programmaticScroll)weightChartProgrammaticScrollLeft=null;
      if(scroller&&buckets.length&&!weightChartPointerStart?.scrubbing&&!programmaticScroll){
        const spacing=weightChartPointSpacing(),centerX=scroller.scrollLeft+scroller.clientWidth/2;
        const index=Math.max(0,Math.min(buckets.length-1,Math.round((centerX-16)/Math.max(1,spacing))));
        let nearest=buckets[index];
        if(!nearest?.count){let distance=Infinity;for(let i=0;i<buckets.length;i++){if(!buckets[i].count)continue;const d=Math.abs(i-index);if(d<distance){distance=d;nearest=buckets[i];}}}
        if(nearest?.count)weightChartSelectedId=nearest.key;
      }
      drawWeightChart();renderWeightChartData();renderWeightPeriodAnalytics();syncWeightChartNavigator();
    });
  }
