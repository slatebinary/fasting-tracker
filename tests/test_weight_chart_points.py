#!/usr/bin/env python3
"""Regression: Daily and aggregate weight-chart points reveal value plus exact time/period."""
import sys
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

data=build_data(5)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.8.18',seenAt:new Date().toISOString()})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.8.18'",timeout=20000)
    page.locator('.tab[data-screen="weight"]').click()
    page.wait_for_function("document.querySelector('#weight')?.classList.contains('active')",timeout=5000)
    # Daily is the default. Five individual measurements should remain five points.
    page.wait_for_function("document.querySelector('#weightChartScroller')?.dataset.period === 'daily'",timeout=5000)
    daily_info=page.locator('#weightChartScroller').evaluate("e=>({d:+e.dataset.dataPointCount,left:e.scrollLeft,max:e.scrollWidth-e.clientWidth})")
    if daily_info['d'] != 5:
        print('FAIL: Daily mode did not retain all five individual measurements',daily_info); sys.exit(1)
    # The latest raw point is the rightmost point when <=30 entries are visible.
    daily_pos=page.locator('#weightChart').evaluate("""(c) => {
      const values=[80,79.9998,79.9996,79.9994,79.9992], target=75, v=values[values.length-1];
      let minV=Math.min(...values,target), maxV=Math.max(...values,target), span=maxV-minV;
      const padV=span>0?Math.max(span*.15,1):2; minV-=padV; maxV+=padV; span=maxV-minV||1;
      const top=18,bottom=38,left=16,right=14,plotW=c.clientWidth-left-right,h=240-top-bottom;
      return {x:left+plotW,y:top+h-((v-minV)/span)*h};
    }""")
    page.locator('#weightChart').click(position={'x':daily_pos['x'],'y':daily_pos['y']})
    page.wait_for_function("!document.querySelector('#weightChartDetail')?.hidden",timeout=5000)
    daily_detail=page.locator('#weightChartDetail').inner_text()
    if 'kg' not in daily_detail or 'Average' in daily_detail:
        print('FAIL: Daily point did not show an exact individual value/date detail:',daily_detail); sys.exit(1)

    page.locator('[data-weight-period="year"]').click()
    page.wait_for_function("document.querySelector('#weightChartScroller')?.dataset.period === 'year'",timeout=5000)
    page.wait_for_timeout(100)
    # Five daily measurements in one year aggregate to one average point. The
    # single point is centered in the plot; derive its y from the public data.
    pos=page.locator('#weightChart').evaluate("""(c) => {
      const values=[80,79.9998,79.9996,79.9994,79.9992], avg=values.reduce((a,b)=>a+b,0)/values.length, target=75;
      let minV=Math.min(avg,target), maxV=Math.max(avg,target), span=maxV-minV;
      const padV=span>0?Math.max(span*.15,1):2; minV-=padV; maxV+=padV; span=maxV-minV||1;
      const top=18,bottom=38,left=16,right=14,plotW=c.clientWidth-left-right,h=240-top-bottom;
      return {x:left+plotW/2,y:top+h-((avg-minV)/span)*h};
    }""")
    page.locator('#weightChart').click(position={'x':pos['x'],'y':pos['y']})
    page.wait_for_function("!document.querySelector('#weightChartDetail')?.hidden",timeout=5000)
    detail=page.locator('#weightChartDetail').inner_text()
    if 'Average' not in detail or 'kg' not in detail or '5 measurements' not in detail:
        print('FAIL: aggregate weight point did not show average/count detail:', detail); sys.exit(1)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: Daily points show exact value/time and aggregate points show explicit period/count')
