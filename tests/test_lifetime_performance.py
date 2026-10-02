#!/usr/bin/env python3
"""70-year daily-history browser responsiveness regression.

25,567 completed fasts + 25,567 weight records approximates 70 years of daily use.
This models an established v1.8.13 IndexedDB database with its persisted daily
aggregate already present, which is the normal state after years of incremental use.
"""
import sys, time
from browser_perf_common import inlined_html, STORAGE_SHIM, measure_click, measure_pointer_paint
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

COUNT=25567
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--js-flags=--max-old-space-size=1024'])
    page=browser.new_page(viewport={'width':390,'height':844}); errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    seed_start=time.perf_counter()
    page.evaluate("""count => {
      const base=1767225600000, dayMs=86400000, hour=3600000;
      const records=[], weights=[], daily=new Map();
      const add=(key,ms)=>daily.set(key,(daily.get(key)||0)+ms);
      for(let i=0;i<count;i++){
        const day=base-(count-i)*dayMs;
        const start=day+18*hour, end=start+16*hour;
        records.push({id:'r'+i,start:new Date(start).toISOString(),end:new Date(end).toISOString(),goalHours:16,timeZone:'UTC',createdAt:null,modifiedAt:null});
        const whenIso=new Date(day+8*hour).toISOString(); weights.push({id:'w'+i,when:whenIso,kg:80-Math.min(10,i*0.0002),timeZone:'UTC',calendarDay:whenIso.slice(0,10),createdAt:null,modifiedAt:null});
        add(new Date(start).toISOString().slice(0,10),6*hour);
        add(new Date(end-1).toISOString().slice(0,10),10*hour);
      }
      const data={dataVersion:1,revision:1,updatedAt:'2026-01-01T00:00:00.000Z',goalHours:16,activeStart:null,activeGoalHours:null,activeTimeZone:null,activeCreatedAt:null,activeModifiedAt:null,records,weights,weightUnit:'kg',targetWeightKg:75,gamificationEnabled:true,language:'en',appearance:'system',iconChoice:'plate'};
      window.__seedFastingDb(data,[...daily.entries()]);
      localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.8.13',seenAt:new Date().toISOString()}));
    }""", COUNT)
    seed_ms=(time.perf_counter()-seed_start)*1000
    start=time.perf_counter(); page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.8.13'",timeout=30000)
    boot=(time.perf_counter()-start)*1000
    if errors: print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    if page.locator('#recoveryBanner').is_visible(): print('FAIL: 70-year valid dataset entered Recovery mode'); sys.exit(1)
    timings={'seed':seed_ms,'boot':boot}
    timings['weight']=measure_click(page,'.tab[data-screen="weight"]',"document.querySelector('#weight.screen.active') !== null && document.querySelector('#wLatest').textContent !== '—'",20000)
    # Lifetime chart must virtualize its canvas: thousands of weekly aggregate
    # periods may create a large scroll track, but never a giant bitmap.
    page.locator('[data-weight-period="week"]').click(); page.wait_for_timeout(180)
    weight_chart=page.locator('#weightChartScroller').evaluate("e=>({b:+e.dataset.bucketCount,d:+e.dataset.dataPointCount,left:e.scrollLeft,max:e.scrollWidth-e.clientWidth,canvas:e.querySelector('#weightChart').clientWidth})")
    if weight_chart['d'] < 3000 or weight_chart['canvas'] > 800:
        print('FAIL: 70-year weekly weight chart is not virtualized as expected',weight_chart); sys.exit(1)
    if weight_chart['max'] > 1 and abs(weight_chart['left']-weight_chart['max']) > 2:
        print('FAIL: 70-year weight chart did not open on newest side',weight_chart); sys.exit(1)
    timings['history']=measure_click(page,'.tab[data-screen="history"]',"document.querySelector('#history.screen.active') !== null && document.querySelectorAll('#historyList .historyRow').length > 0",20000)
    timings['stats']=measure_click(page,'.tab[data-screen="stats"]',f"document.querySelector('#stats.screen.active') !== null && document.querySelector('#mTotal').textContent.replace(/\\D/g,'') === '{COUNT}'",20000)
    for mode in ('calendar','trend','weeks','timeline'):
        timings[f'viz-{mode}']=measure_pointer_paint(page,f'#statsVizSwitcher [data-viz="{mode}"]'); page.wait_for_timeout(150)
    timings['settings-paint']=page.evaluate("""() => new Promise(resolve => { const el=document.querySelector('.tab[data-screen="settings"]'); const t=performance.now(); el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:88,pointerType:'touch',button:0,clientX:5,clientY:5})); el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:88,pointerType:'touch',button:0,clientX:5,clientY:5})); requestAnimationFrame(()=>resolve(performance.now()-t)); })""")
    browser.close()
print('70-year performance (ms): '+', '.join(f'{k}={v:.1f}' for k,v in timings.items()))
if boot>10000: print(f'FAIL: established 70-year IndexedDB boot exceeded 10s ({boot:.1f}ms)'); sys.exit(1)
if any(v>3000 for k,v in timings.items() if k not in ('seed','boot')): print('FAIL: lifetime interaction exceeded 3s regression ceiling'); sys.exit(1)
print('PASS: 70-year / 25,567+25,567 lifetime responsiveness test')
