#!/usr/bin/env python3
"""Regression: selected fasting Timeline segment shows actual duration versus that fast's saved target."""
import sys, datetime
from browser_perf_common import inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

now=datetime.datetime.now(datetime.timezone.utc)
yday=(now-datetime.timedelta(days=1)).date()
start=datetime.datetime.combine(yday, datetime.time(6,0), tzinfo=datetime.timezone.utc)
end=start+datetime.timedelta(hours=13,minutes=5)
iso=lambda d:d.isoformat(timespec='milliseconds').replace('+00:00','Z')
data={
  'dataVersion':1,'revision':1,'updatedAt':iso(now),'goalHours':16,
  'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,'activeCreatedAt':None,'activeModifiedAt':None,
  'records':[{'id':'target23','start':iso(start),'end':iso(end),'goalHours':23,'timeZone':'UTC','createdAt':None,'modifiedAt':None}],
  'weights':[],'weightUnit':'kg','targetWeightKg':None,'gamificationEnabled':True,
  'language':'en','appearance':'system','iconChoice':'plate'
}

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844}, timezone_id='UTC')
    errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.8.13',seenAt:new Date().toISOString()})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.8.13'",timeout=20000)
    page.locator('.tab[data-screen="stats"]').click()
    page.wait_for_function("document.querySelector('#stats')?.classList.contains('active')",timeout=5000)
    page.wait_for_timeout(150)
    # Yesterday is the second-to-last of the 14 Timeline columns. Tap 12:00,
    # which lies inside the seeded 06:00-19:05 fast.
    page.locator('#timelineScroller').evaluate("e=>{e.scrollLeft=Math.max(0,e.scrollWidth-e.clientWidth)}")
    hit=page.locator('#chart').evaluate("""c=>{
      const cssW=c.clientWidth,cssH=c.clientHeight,top=18,bottom=38,left=6,right=6;
      const w=cssW-left-right,h=cssH-top-bottom,gap=8,bw=(w-gap*13)/14,slot=bw+gap;
      const i=12; return {x:left+i*slot+bw/2,y:top+h*(12/24)};
    }""")
    rect=page.locator('#chart').bounding_box()
    client_x=rect['x']+hit['x']; client_y=rect['y']+hit['y']
    page.locator('#chart').evaluate("""(c,p)=>{
      c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:71,pointerType:'touch',clientX:p.x,clientY:p.y,button:0}));
      c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:71,pointerType:'touch',clientX:p.x,clientY:p.y,button:0}));
    }""", {'x':client_x,'y':client_y})
    page.wait_for_timeout(100)
    detail=page.locator('#chartDetailText').inner_text()
    if '13h 5m of 23h 0m' not in detail:
        print('FAIL: selected fasting segment did not show duration versus saved target:',detail); sys.exit(1)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: fasting Timeline selected segment shows actual duration versus saved target')
