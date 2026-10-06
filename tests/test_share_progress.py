#!/usr/bin/env python3
"""Regression: progress sharing is selectable, privacy-aware and includes the install link."""
import sys
from datetime import datetime, timezone, timedelta
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

data=build_data(6)
now=datetime.now(timezone.utc)
data['activeStart']=(now-timedelta(hours=7,minutes=25)).isoformat().replace('+00:00','Z')
data['activeGoalHours']=16
data['activeTimeZone']='UTC'
data['activeCreatedAt']=data['activeStart']
data['activeModifiedAt']=None

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("""data => {
      __seedFastingDb(data, []);
      localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.11.4',seenAt:new Date().toISOString()}));
      Object.defineProperty(navigator,'share',{configurable:true,value:async payload=>{window.__sharePayload=payload;}});
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedShare=text;}}});
    }""", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.11.4'",timeout=20000)

    page.locator('#shareProgressBtn').click()
    page.locator('#shareModal').wait_for(state='visible',timeout=5000)
    if page.locator('#shareWeightToggle').is_checked():
        print('FAIL: weight sharing is not off by default'); sys.exit(1)
    preview=page.locator('#sharePreview').inner_text()
    if 'Current fast:' not in preview or 'Fasting:' not in preview or 'Consistency:' not in preview:
        print('FAIL: default share preview is missing fasting/summary/consistency'); sys.exit(1)
    if 'Weight:' in preview:
        print('FAIL: default share preview exposed weight'); sys.exit(1)
    if 'Installation link included:' not in page.locator('#shareInstallLink').inner_text():
        print('FAIL: install link is not clearly included in share UI'); sys.exit(1)

    page.locator('#shareNativeBtn').click()
    page.wait_for_function("window.__sharePayload && window.__sharePayload.url",timeout=5000)
    payload=page.evaluate('window.__sharePayload')
    if 'Current fast:' not in payload.get('text',''):
        print('FAIL: native share payload lacks progress text'); sys.exit(1)
    if 'icon=plate' not in payload.get('url',''):
        print('FAIL: native share payload lacks installation/icon link'); sys.exit(1)

    page.locator('#shareWeightToggle').check()
    if 'Weight:' not in page.locator('#sharePreview').inner_text():
        print('FAIL: explicitly enabled weight progress is not included'); sys.exit(1)
    page.locator('#shareCopyBtn').click()
    page.wait_for_function("window.__copiedShare && window.__copiedShare.includes('Install/open Fasting Tracker:')",timeout=5000)
    copied=page.evaluate('window.__copiedShare')
    if 'Weight:' not in copied or 'icon=plate' not in copied:
        print('FAIL: copied share text lacks enabled weight or install link'); sys.exit(1)

    page.locator('#shareCancelBtn').click()
    page.locator('.tab[data-screen="stats"]').click()
    page.locator('#shareStatsBtn').click()
    page.locator('#shareModal').wait_for(state='visible',timeout=5000)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: progress sharing is selectable, private by default and includes the installation link')
