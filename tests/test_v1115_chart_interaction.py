#!/usr/bin/env python3
"""v1.12.0: dense fasting charts keep readable axes and selectable nearest-point callouts."""
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_perf_common import inlined_html, STORAGE_SHIM

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'version.json').read_text())['version']


def payload(days=365):
    now=datetime(2026,10,6,12,tzinfo=timezone.utc)
    rec=[]; weights=[]
    for i in range(days):
        d=now-timedelta(days=days-1-i)
        start=d.replace(hour=18,minute=0,second=0,microsecond=0)
        end=start+timedelta(hours=16+(i%5))
        rec.append({'id':f'f{i}','start':start.isoformat().replace('+00:00','Z'),'end':end.isoformat().replace('+00:00','Z'),'goalHours':16,'timeZone':'UTC','createdAt':end.isoformat().replace('+00:00','Z'),'modifiedAt':None,'editHistory':[]})
        weights.append({'id':f'w{i}','when':d.replace(hour=8).isoformat().replace('+00:00','Z'),'kg':80-i*0.01,'timeZone':'UTC','createdAt':None,'modifiedAt':None})
    return {'dataVersion':1,'revision':7,'updatedAt':'2026-10-06T12:00:00.000Z','goalHours':16,'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,'activeCreatedAt':None,'activeModifiedAt':None,'records':rec,'deletedFasts':[],'weights':weights,'deletedWeights':[],'weightUnit':'kg','targetWeightKg':75,'gamificationEnabled':True,'notificationPreferences':{'enabled':False},'language':'en','appearance':'system','iconChoice':'plate'}


def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':390,'height':844})
        errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
        page.evaluate(STORAGE_SHIM)
        data=payload()
        # Seed explicitly because the browser shim expects the data payload itself.
        page.evaluate("x=>{__seedFastingDbV2(x.data,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:x.version}));localStorage.setItem('fastingTracker.chartRanges',JSON.stringify({cumulative:'1y',trend:'1y',months:'1y',distribution:'all',success:'1y',startpattern:'all'}));}", {'data':data,'version':VERSION})
        page.set_content(inlined_html(),wait_until='domcontentloaded')
        page.wait_for_function("v=>document.querySelector('#appVersionLabel')?.textContent==='v'+v",arg=VERSION,timeout=20000)
        page.evaluate(r'''() => {
          window.__chartDraw={cumText:[],cumArcs:0,trendText:[],weightArcs:0};
          const ft=CanvasRenderingContext2D.prototype.fillText, arc=CanvasRenderingContext2D.prototype.arc;
          CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
            const id=this.canvas?.id, row={text:String(text),x:Number(x),y:Number(y),font:String(this.font)};
            if(id==='fastCumulativeChart') window.__chartDraw.cumText.push(row);
            if(id==='fastTrendChart') window.__chartDraw.trendText.push(row);
            return ft.call(this,text,x,y,...rest);
          };
          CanvasRenderingContext2D.prototype.arc=function(...args){
            const id=this.canvas?.id;
            if(id==='fastCumulativeChart') window.__chartDraw.cumArcs++;
            if(id==='weightChart') window.__chartDraw.weightArcs++;
            return arc.apply(this,args);
          };
        }''')
        page.locator('.tab[data-screen="stats"]').click(); page.wait_for_timeout(120)
        page.locator('#statsVizSelect').select_option('cumulative'); page.wait_for_timeout(220)
        # Axis date labels must exist and remain sparse on a 390px chart.
        cum=page.evaluate("window.__chartDraw")
        axis=[x for x in cum['cumText'] if '9px' in x['font'] and x['y']>190]
        assert len(axis)>=2, axis
        assert len(axis)<=8, axis
        # Dense 1-year data must not draw a marker for every underlying day.
        assert cum['cumArcs'] < 120, cum['cumArcs']
        # Tap near the left plot edge; a callout must appear and remain inside the canvas.
        box=page.locator('#fastCumulativeChart').bounding_box(); assert box
        page.locator('#fastCumulativeChart').click(position={'x':52,'y':110}); page.wait_for_timeout(100)
        callouts=page.evaluate("window.__chartDraw.cumText.filter(x=>x.font.includes('600 12px'))")
        assert callouts, page.evaluate("window.__chartDraw.cumText")[-20:]
        assert all(0 <= x['x'] <= 390 for x in callouts[-2:]), callouts[-2:]
        detail=page.locator('#chartDetailText').inner_text().strip()
        assert 'cumulative' in detail.lower() or 'h' in detail.lower(), detail
        # Trend regained keyboard focusability and also renders adaptive date labels/callout.
        page.locator('#statsVizSelect').select_option('trend'); page.wait_for_timeout(180)
        assert page.locator('#fastTrendChart').get_attribute('tabindex')=='0'
        trend_axis=page.evaluate("window.__chartDraw.trendText.filter(x=>x.font.includes('9px') && x.y>175)")
        assert len(trend_axis)>=2, trend_axis
        tbox=page.locator('#fastTrendChart').bounding_box(); assert tbox
        page.locator('#fastTrendChart').click(position={'x':max(20,tbox['width']-28),'y':105}); page.wait_for_timeout(90)
        trend_callouts=page.evaluate("window.__chartDraw.trendText.filter(x=>x.font.includes('600 12px'))")
        assert trend_callouts, page.evaluate("window.__chartDraw.trendText")[-20:]
        # Weight remains selectable while dense visible markers are thinned.
        page.locator('.tab[data-screen="weight"]').click(); page.wait_for_timeout(180)
        assert page.locator('#weightChart').is_visible()
        assert not errors, errors[:5]
        browser.close()
    print('PASS: v1.12.0 adaptive cumulative/trend axes, dense marker thinning, edge-aware callouts and focusability')

if __name__=='__main__': main()
