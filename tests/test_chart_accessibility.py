#!/usr/bin/env python3
"""Regression: fasting/weight charts expose an on-demand text representation."""
import sys
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}');sys.exit(0)

data=build_data(12)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM);page.evaluate("data=>{__seedFastingDbV2(data,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.9.1'}));}",data)
    page.set_content(inlined_html(),wait_until='domcontentloaded');page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.9.1'",timeout=20000)
    page.locator('.tab[data-screen="weight"]').click();page.locator('#weightChartDataBtn').click();page.wait_for_function("!document.querySelector('#weightChartData').hidden && document.querySelectorAll('#weightChartData li').length>0")
    if page.locator('#weightChartDataBtn').get_attribute('aria-expanded')!='true': print('FAIL: weight data disclosure aria state wrong');sys.exit(1)
    page.locator('.tab[data-screen="stats"]').click();page.locator('#statsChartDataBtn').click();page.wait_for_function("!document.querySelector('#statsChartData').hidden && document.querySelectorAll('#statsChartData li').length>0")
    if errors: print('FAIL: browser errors: '+' | '.join(errors[:3]));sys.exit(1)
    browser.close()
print('PASS: accessible chart-data disclosures for weight and fasting statistics')
