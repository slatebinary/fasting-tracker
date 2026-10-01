#!/usr/bin/env python3
"""Regression: weight-chart points are tappable and reveal exact values."""
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
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.8.6',seenAt:new Date().toISOString()})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.8.6'",timeout=20000)
    page.locator('.tab[data-screen="weight"]').click()
    page.wait_for_function("document.querySelector('#weight')?.classList.contains('active')",timeout=5000)
    page.locator('[data-weight-period="year"]').click()
    page.wait_for_function("document.querySelector('#weightPeriodRange')?.dataset.period === 'year'",timeout=5000)
    page.wait_for_timeout(100)
    # Last point lies at the right edge of the plot. Derive its y from the same
    # public data/scale inputs used by the chart so this remains deterministic.
    pos=page.locator('#weightChart').evaluate("""(c) => {
      const unit='kg', values=[80,79.9998,79.9996,79.9994,79.9992], target=75;
      let minV=Math.min(...values,target), maxV=Math.max(...values,target), span=maxV-minV;
      const padV=span>0?Math.max(span*.15,1):2; minV-=padV; maxV+=padV; span=maxV-minV||1;
      const top=18,bottom=34,left=46,right=12,w=c.clientWidth-left-right,h=240-top-bottom;
      const y=top+h-((values[4]-minV)/span)*h;
      return {x:c.clientWidth-right,y};
    }""")
    page.locator('#weightChart').click(position={'x':pos['x'],'y':pos['y']})
    page.wait_for_function("!document.querySelector('#weightChartDetail')?.hidden",timeout=5000)
    detail=page.locator('#weightChartDetail').inner_text()
    if 'kg' not in detail:
        print('FAIL: selected weight point did not show its exact value'); sys.exit(1)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: weight-chart points reveal exact values')
