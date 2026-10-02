#!/usr/bin/env python3
"""Regression: cross-day fast/gap continuations are visually linked and detail wording is exact."""
import sys, datetime
from browser_perf_common import inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

now=datetime.datetime.now(datetime.timezone.utc)
today=now.date()
d3=today-datetime.timedelta(days=3)
d2=today-datetime.timedelta(days=2)
d1=today-datetime.timedelta(days=1)
fast_a_start=datetime.datetime.combine(d3, datetime.time(10,0), tzinfo=datetime.timezone.utc)
fast_a_end=datetime.datetime.combine(d2, datetime.time(14,0), tzinfo=datetime.timezone.utc) # 28h
fast_b_start=datetime.datetime.combine(d1, datetime.time(10,0), tzinfo=datetime.timezone.utc)
fast_b_end=datetime.datetime.combine(d1, datetime.time(18,0), tzinfo=datetime.timezone.utc)
iso=lambda d:d.isoformat(timespec='milliseconds').replace('+00:00','Z')
data={
  'dataVersion':1,'revision':1,'updatedAt':iso(now),'goalHours':16,
  'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,'activeCreatedAt':None,'activeModifiedAt':None,
  'records':[
    {'id':'cross28','start':iso(fast_a_start),'end':iso(fast_a_end),'goalHours':16,'timeZone':'UTC','createdAt':None,'modifiedAt':None},
    {'id':'later','start':iso(fast_b_start),'end':iso(fast_b_end),'goalHours':16,'timeZone':'UTC','createdAt':None,'modifiedAt':None}
  ],
  'weights':[],'weightUnit':'kg','targetWeightKg':None,'gamificationEnabled':True,
  'language':'en','appearance':'system','iconChoice':'plate'
}

# 14-day chart: today=13, yesterday=12, -2=11, -3=10.
def chart_point(page, day_index, hour):
    return page.locator('#chart').evaluate("""(c,p)=>{
      const cssW=c.clientWidth,cssH=c.clientHeight,top=18,bottom=38,left=6,right=6;
      const w=cssW-left-right,h=cssH-top-bottom,gap=8,bw=(w-gap*13)/14,slot=bw+gap;
      return {x:left+p.i*slot+bw/2,y:top+h*(p.hour/24)};
    }""", {'i':day_index,'hour':hour})

def pixel(page, point):
    return page.locator('#chart').evaluate("""(c,p)=>Array.from(c.getContext('2d').getImageData(
      Math.max(0,Math.min(c.width-1,Math.round(p.x*(c.width/c.clientWidth)))),
      Math.max(0,Math.min(c.height-1,Math.round(p.y*(c.height/c.clientHeight)))),1,1).data)""", point)

def tap(page, point):
    rect=page.locator('#chart').bounding_box()
    x=rect['x']+point['x']; y=rect['y']+point['y']
    page.locator('#chart').evaluate("""(c,p)=>{
      c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:91,pointerType:'touch',clientX:p.x,clientY:p.y,button:0}));
      c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:91,pointerType:'touch',clientX:p.x,clientY:p.y,button:0}));
    }""", {'x':x,'y':y})

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844},timezone_id='UTC')
    errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.8.13',seenAt:new Date().toISOString()})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.8.13'",timeout=20000)
    page.locator('.tab[data-screen="stats"]').click(); page.wait_for_timeout(180)
    page.locator('#timelineScroller').evaluate("e=>{e.scrollLeft=Math.max(0,e.scrollWidth-e.clientWidth)}")

    # Select the first-day piece of the 28h fast. The second-day piece must
    # change appearance, and detail wording must avoid 23:59/14h inconsistency.
    selected=chart_point(page,10,20)
    related=chart_point(page,11,5)
    before_fast=pixel(page,related)
    tap(page,selected); page.wait_for_timeout(80)
    after_fast=pixel(page,related)
    detail=page.locator('#chartDetailText').inner_text()
    if before_fast==after_fast:
        print('FAIL: adjacent-day continuation of selected fast was not visually marked'); sys.exit(1)
    expected='Fasting this day: 10:00–end of day (14h 0m). Full fast: 28h 0m of 16h 0m target — 12h 0m beyond target.'
    if detail != expected:
        print('FAIL: cross-day fasting detail mismatch:',detail); sys.exit(1)

    # The non-fasting gap from day -2 14:00 until day -1 10:00 also crosses
    # midnight. Selecting its first piece must mark the next-day continuation.
    gap_selected=chart_point(page,11,20)
    gap_related=chart_point(page,12,5)
    before_gap=pixel(page,gap_related)
    tap(page,gap_selected); page.wait_for_timeout(80)
    after_gap=pixel(page,gap_related)
    if before_gap==after_gap:
        print('FAIL: adjacent-day continuation of selected non-fasting gap was not visually marked'); sys.exit(1)
    gap_detail=page.locator('#chartDetailText').inner_text()
    if 'Non-fasting gap: 14:00–end of day (10h 0m).' != gap_detail:
        print('FAIL: cross-day gap detail mismatch:',gap_detail); sys.exit(1)

    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: fasting Timeline highlights adjacent-day fast/gap continuations and uses exact cross-day wording')
