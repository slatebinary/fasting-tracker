#!/usr/bin/env python3
"""Regression: first launch after a legacy/localStorage release must not report a false snapshot failure."""
import json, sys
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

payload=json.dumps(build_data(8),separators=(',',':'))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; dialogs=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.on('dialog',lambda d:(dialogs.append(d.message),d.dismiss()))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("""([payload]) => {
      localStorage.setItem('fastingTracker.data', payload);
      localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.7.11',seenAt:'2026-09-30T10:00:00.000Z'}));
    }""", [payload])
    page.set_content(inlined_html(), wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.8.7'",timeout=20000)
    page.wait_for_timeout(300)
    if errors:
        print('FAIL: startup browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    bad=[m for m in dialogs if 'recovery snapshot could not be saved' in m.lower()]
    if bad:
        print('FAIL: false recovery snapshot failure alert: '+bad[0]); sys.exit(1)
    if page.locator('#recoveryBanner').is_visible():
        print('FAIL: valid migrated data entered Recovery mode'); sys.exit(1)
    # The migrated data should remain available and snapshot UI should no longer show a failure state.
    page.locator('.tab[data-screen="settings"]').click()
    page.wait_for_timeout(100)
    status=page.locator('#snapshotStatus').inner_text()
    if 'could not' in status.lower() or 'failed' in status.lower():
        print('FAIL: snapshot status reports failure after successful startup: '+status); sys.exit(1)
    browser.close()
print('PASS: startup migration snapshot does not trigger false failure alert')
