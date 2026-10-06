#!/usr/bin/env python3
"""Regression: enabled gamification XP summary must render on the Fasting screen at startup."""
import sys
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

data=build_data(12)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.11.1',seenAt:new Date().toISOString()})); }", data)
    page.set_content(inlined_html(), wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.11.1'", timeout=20000)
    page.wait_for_function("document.querySelector('#gSummaryXP')?.textContent.includes('XP') && document.querySelector('#gSummaryXP')?.textContent !== '—'", timeout=20000)
    if errors:
        print('FAIL: startup browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    if not page.locator('#gamificationSummary').is_visible():
        print('FAIL: gamification summary is hidden even though gamification is enabled'); sys.exit(1)
    xp=page.locator('#gSummaryXP').inner_text().strip()
    if xp in ('—','0 XP'):
        print('FAIL: startup gamification XP was not populated: '+xp); sys.exit(1)
    if page.locator('.screen.active').get_attribute('id') != 'fasting':
        print('FAIL: test did not remain on Fasting screen'); sys.exit(1)
    browser.close()
print('PASS: gamification XP summary renders immediately on startup')
