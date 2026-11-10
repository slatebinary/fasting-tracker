  function drawGenericBarChart(canvasId,items,valueKey,{maxValue=null,valueSuffix='',selectedKey=null,detailBuilder=null,percent=false,integerScale=false}={}){
    const c=el(canvasId),ctx=c.getContext('2d'),ratio=window.devicePixelRatio||1,cssW=c.clientWidth||660,cssH=c.clientHeight||220;c.width=Math.floor(cssW*ratio);c.height=Math.floor(cssH*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,cssW,cssH);
    const top=18,bottom=44,left=44,right=10,w=cssW-left-right,h=cssH-top-bottom,rawPeak=Math.max(percent?100:1,maxValue==null?FTVisuals.maxValue(items,valueKey,1):maxValue),peak=integerScale?Math.max(2,Math.ceil(rawPeak)):rawPeak;
    const style=getComputedStyle(document.documentElement),line=style.getPropertyValue('--line').trim(),accent=style.getPropertyValue('--accent').trim(),muted=style.getPropertyValue('--muted').trim(),card=style.getPropertyValue('--card').trim(),textColor=style.getPropertyValue('--text').trim();ctx.strokeStyle=line;ctx.lineWidth=1;
    [0,.5,1].forEach(fr=>{const y=top+h-h*fr,tickValue=integerScale?Math.round(peak*fr):peak*fr;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(cssW-right,y);ctx.stroke();ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='right';ctx.fillText(`${formatNumber(tickValue,0,percent||integerScale?0:1)}${valueSuffix}`,left-5,y+3);});
    const n=Math.max(1,items.length),gap=n>80?0.25:Math.max(2,Math.min(10,w/(n*5))),bw=Math.max(.35,(w-gap*(n-1))/n),centers=items.map((_,i)=>left+i*(bw+gap)+bw/2);genericChartHitLayout=[];
    ctx.font='9px -apple-system';const axisLabels=FTVisuals.axisLabelPlan(items,{positions:centers,measureText:text=>ctx.measureText(String(text)).width,maxLabels:12,minGap:7}),axisByIndex=new Map(axisLabels.map(x=>[x.index,x.text]));
    let selectedGeometry=null;
    items.forEach((item,i)=>{const value=Math.max(0,Number(item[valueKey])||0),bh=(Math.min(peak,value)/peak)*h,x=left+i*(bw+gap),y=top+h-bh;ctx.fillStyle=accent;ctx.globalAlpha=.86;ctx.fillRect(x,y,bw,bh);ctx.globalAlpha=1;if(selectedKey===item.key){ctx.strokeStyle='#ffffff';ctx.lineWidth=Math.min(4,Math.max(1,bw));ctx.strokeRect(x-2,Math.max(top,y-2),bw+4,Math.min(h,bh+4));ctx.strokeStyle=accent;ctx.lineWidth=1.5;ctx.strokeRect(x,Math.max(top,y),bw,Math.min(h,bh));selectedGeometry={item,value,x:x+bw/2,y};}if(axisByIndex.has(i)){const text=axisByIndex.get(i),tw=ctx.measureText(String(text)).width,tx=Math.max(left+tw/2,Math.min(cssW-right-tw/2,x+bw/2));ctx.fillStyle=muted;ctx.font='9px -apple-system';ctx.textAlign='center';ctx.fillText(text,tx,cssH-15);}genericChartHitLayout.push({item,x,y:top,w:Math.max(bw,3),h,canvasId,detailBuilder});});
    if(selectedGeometry){const valueText=`${formatNumber(selectedGeometry.value,0,percent||integerScale?0:1)}${valueSuffix}`;drawChartCallout(ctx,{x:selectedGeometry.x,y:selectedGeometry.y,primary:valueText,secondary:selectedGeometry.item.label||selectedGeometry.item.key,canvasW:cssW,canvasH:cssH,accent,card,textColor,muted});}
    renderChartDetailForMode();
  }
  // Track pointer activation per canvas. A single global timestamp can
  // incorrectly suppress a completed-click fallback on another chart, and a
  // zero-initialized timestamp can suppress the first click shortly after load.
  const genericChartPointerStamps=new WeakMap();
  function handleGenericChartPointer(event){
    if(event.button!=null&&event.button!==0)return;
    genericChartPointerStamps.set(event.currentTarget,performance.now());
    selectGenericChartItem(event);
  }
  function handleGenericChartClick(event){
    // Pointer-capable browsers already select on pointerdown. A completed click
    // remains the fallback for touch/browser implementations that omit it.
    // Deduplicate only against a recent pointer event on this same canvas.
    if(event.detail===0)return;
    const canvas=event.currentTarget,stamp=genericChartPointerStamps.get(canvas);
    if(stamp!=null&&performance.now()-stamp<700){genericChartPointerStamps.delete(canvas);return;}
    selectGenericChartItem(event);
  }
  function selectGenericChartItem(event){const c=event.currentTarget,rect=c.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;const hit=genericChartHitLayout.find(h=>h.canvasId===c.id&&x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h);if(!hit)return;genericChartSelectedKey=hit.item.key;statsDetailOverride=hit.detailBuilder?hit.detailBuilder(hit.item):null;renderStatsVisualizationMode(statsVizMode);renderStatsChartData();}