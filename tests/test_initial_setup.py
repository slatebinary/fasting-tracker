#!/usr/bin/env python3
"""Regression: optional first-run setup guides install -> storage -> JSON backup -> defaults and can resume in a standalone app."""
import sys
from browser_perf_common import inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

EXTRA_SHIM = r"""() => {
  let persistent=false;
  Object.defineProperty(navigator,'storage',{value:{
    persisted:async()=>persistent,
    persist:async()=>{ persistent=true; return true; },
    estimate:async()=>({usage:1024*64,quota:1024*1024*50})
  },configurable:true});
  Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});
  Object.defineProperty(navigator,'share',{value:async()=>{ window.__setupShared=(window.__setupShared||0)+1; },configurable:true});
  window.__setupNotificationRequests=0;
  const MockNotification={permission:'default',requestPermission:async()=>{ window.__setupNotificationRequests+=1; MockNotification.permission='granted'; return 'granted'; }};
  Object.defineProperty(window,'Notification',{value:MockNotification,configurable:true});
  const registration={showNotification:async()=>{}};
  Object.defineProperty(navigator,'serviceWorker',{value:{ready:Promise.resolve(registration),register:async()=>({}),addEventListener:()=>{},controller:null},configurable:true});
} """

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])

    # Fresh browser/desktop flow: the guide is optional but opens on an empty first installation.
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM); page.evaluate(EXTRA_SHIM)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.12.0'",timeout=20000)
    page.wait_for_function("document.querySelector('#setupModal') && !document.querySelector('#setupModal').hidden",timeout=5000)
    if 'Step 1 of 6' not in page.locator('#setupProgress').inner_text():
        print('FAIL: fresh installation did not start at setup step 1'); sys.exit(1)

    page.locator('#setupNextBtn').click()
    page.wait_for_function("!document.querySelector('#setupStepStorage').hidden",timeout=5000)
    page.locator('#setupProtectBtn').click()
    page.wait_for_function("document.querySelector('#setupStorageStatus').textContent.includes('protected')",timeout=5000)

    page.locator('#setupNextBtn').click()
    page.wait_for_function("!document.querySelector('#setupStepBackup').hidden",timeout=5000)
    page.locator('#setupExportBtn').click()
    page.wait_for_function("document.querySelector('#setupBackupStatus').textContent.includes('recorded')",timeout=5000)
    if page.evaluate("window.__setupShared") != 1:
        print('FAIL: first manual JSON backup did not invoke file sharing'); sys.exit(1)

    page.locator('#setupNextBtn').click()
    page.wait_for_function("!document.querySelector('#setupStepBasics').hidden",timeout=5000)
    page.locator('#setupGoalInput').fill('18')
    page.locator('#setupUnitLbBtn').click()
    page.locator('#setupGameToggle').uncheck()
    page.locator('#setupNextBtn').click()
    page.wait_for_function("!document.querySelector('#setupStepNotifications').hidden",timeout=5000)
    if page.evaluate("window.__setupNotificationRequests") != 0:
        print('FAIL: notification permission was requested before explicit onboarding action'); sys.exit(1)
    defaults={
        'setupNotificationTargetToggle':True,
        'setupNotificationBackupToggle':True,
        'setupNotificationSafetyToggle':True,
        'setupNotificationWeighToggle':False,
        'setupNotificationCycleToggle':False,
    }
    for control,expected in defaults.items():
        if page.locator('#'+control).is_checked() != expected:
            print('FAIL: onboarding notification default mismatch for',control); sys.exit(1)
    page.locator('#setupEnableNotificationsBtn').click()
    page.wait_for_function("!document.querySelector('#setupStepReady').hidden",timeout=5000)
    if page.evaluate("window.__setupNotificationRequests") != 1:
        print('FAIL: notification permission was not requested exactly once after Enable notifications'); sys.exit(1)
    summary=page.locator('#setupReadySummary').inner_text()
    if '18h' not in summary or 'lb' not in summary or summary.count('Done') < 2 or 'Notifications' not in summary or 'On' not in summary:
        print('FAIL: readiness summary does not reflect protected storage/backup/defaults:',summary); sys.exit(1)

    page.locator('#setupNextBtn').click()
    page.wait_for_function("document.querySelector('#setupModal').hidden",timeout=5000)
    state=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.setupGuide'))")
    prefs=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.preferences'))")
    meta=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.backupMeta'))")
    if not state.get('completed') or state.get('dismissed'):
        print('FAIL: completed setup state not persisted',state); sys.exit(1)
    if prefs.get('weightUnit')!='lb' or prefs.get('gamificationEnabled') is not False:
        print('FAIL: basic setup preferences not persisted',prefs); sys.exit(1)
    if not meta.get('lastExternalBackupAt'):
        print('FAIL: first external backup timestamp not persisted'); sys.exit(1)
    if page.locator('#goalHours').input_value() != '18':
        print('FAIL: default fasting target was not applied'); sys.exit(1)

    # A fresh installed/Home Screen context skips the already-completed install instruction and continues at storage protection.
    standalone=browser.new_page(viewport={'width':390,'height':844})
    standalone.evaluate(STORAGE_SHIM); standalone.evaluate(EXTRA_SHIM)
    standalone.evaluate("() => Object.defineProperty(navigator,'standalone',{value:true,configurable:true})")
    standalone.set_content(inlined_html(),wait_until='domcontentloaded')
    standalone.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.12.0'",timeout=20000)
    standalone.wait_for_function("document.querySelector('#setupModal') && !document.querySelector('#setupModal').hidden",timeout=5000)
    if 'Step 2 of 6' not in standalone.locator('#setupProgress').inner_text() or standalone.locator('#setupStepStorage').is_hidden():
        print('FAIL: Home Screen launch did not resume at storage-protection step'); sys.exit(1)

    # On iPhone Safari, recommended flow blocks Next until the Home Screen app is opened, while still allowing an explicit browser-only path.
    ctx=browser.new_context(user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',viewport={'width':390,'height':844})
    ios=ctx.new_page(); ios.evaluate(STORAGE_SHIM); ios.evaluate(EXTRA_SHIM)
    ios.set_content(inlined_html(),wait_until='domcontentloaded')
    ios.wait_for_function("document.querySelector('#setupModal') && !document.querySelector('#setupModal').hidden",timeout=5000)
    if not ios.locator('#setupNextBtn').is_disabled() or ios.locator('#setupContinueBrowserBtn').is_hidden():
        print('FAIL: iPhone Safari install step does not enforce/offer the intended paths'); sys.exit(1)
    if 'Safari' not in ios.locator('#setupInstallStatus').inner_text():
        print('FAIL: iPhone-specific Add to Home Screen instructions missing'); sys.exit(1)

    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: optional first-run setup covers Home Screen, persistent storage, first JSON backup, core defaults and explicit notification opt-in')
