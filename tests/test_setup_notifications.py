#!/usr/bin/env python3
"""Regression: onboarding notification step is contextual, explicit and skippable."""
import sys
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])

    # Explicit Not now: no permission prompt and no change to existing notification preferences.
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    data=build_data(0)
    data['notificationPreferences']={'enabled':False,'targetReached':False,'backupDue':True,'longFastSafety':False,'weighIn':True,'weighInCadence':'daily','cycleComplete':True}
    page.evaluate("""data => {
      window.__setupNotificationRequests=0;
      const MockNotification={permission:'default',requestPermission:async()=>{ window.__setupNotificationRequests+=1; MockNotification.permission='granted'; return 'granted'; }};
      Object.defineProperty(window,'Notification',{value:MockNotification,configurable:true});
      const registration={showNotification:async()=>{}};
      Object.defineProperty(navigator,'serviceWorker',{value:{ready:Promise.resolve(registration),register:async()=>({}),addEventListener:()=>{},controller:null},configurable:true});
      __seedFastingDb(data, []);
      localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.11.4',seenAt:new Date().toISOString()}));
      localStorage.setItem('fastingTracker.setupGuide',JSON.stringify({version:1,started:true,dismissed:false,completed:false,currentStep:5,awaitStandalone:false}));
    }""", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.11.4'",timeout=20000)
    page.wait_for_function("!document.querySelector('#setupStepNotifications').hidden",timeout=5000)
    if not page.locator('#setupNextBtn').is_hidden():
        print('FAIL: ordinary Continue button should be hidden on notification-choice step'); sys.exit(1)
    if page.locator('#setupNotificationTargetToggle').is_checked() is not False or page.locator('#setupNotificationWeighToggle').is_checked() is not True:
        print('FAIL: onboarding did not reflect existing notification preferences'); sys.exit(1)
    # The cadence control must respond directly in onboarding. Change it, then use Not now;
    # the UI should change immediately but persistent preferences must remain untouched.
    page.locator('#setupNotificationWeighWeeklyBtn').click()
    page.wait_for_function("document.querySelector('#setupNotificationWeighCadence')?.value === 'weekly'",timeout=5000)
    if page.locator('#setupNotificationWeighWeeklyBtn').get_attribute('aria-pressed') != 'true':
        print('FAIL: onboarding Weekly cadence did not become visibly selected'); sys.exit(1)
    page.locator('#setupSkipNotificationsBtn').click()
    page.wait_for_function("!document.querySelector('#setupStepReady').hidden",timeout=5000)
    if page.evaluate("window.__setupNotificationRequests") != 0:
        print('FAIL: Not now triggered a notification permission prompt'); sys.exit(1)
    page.locator('#setupBackBtn').click()
    page.wait_for_function("!document.querySelector('#setupStepNotifications').hidden",timeout=5000)
    if page.locator('#setupNotificationTargetToggle').is_checked() is not False or page.locator('#setupNotificationWeighToggle').is_checked() is not True or page.locator('#setupNotificationWeighCadence').input_value() != 'daily':
        print('FAIL: Not now modified notification preferences'); sys.exit(1)

    # Cadence can be preselected while the weigh-in reminder is OFF and persists if onboarding notifications are enabled.
    preselect=browser.new_page(viewport={'width':390,'height':844})
    preselect.evaluate(STORAGE_SHIM)
    preselect.evaluate("""() => {
      const MockNotification={permission:'default',requestPermission:async()=>{ MockNotification.permission='granted'; return 'granted'; }};
      Object.defineProperty(window,'Notification',{value:MockNotification,configurable:true});
      const registration={showNotification:async()=>{}};
      Object.defineProperty(navigator,'serviceWorker',{value:{ready:Promise.resolve(registration),register:async()=>({}),addEventListener:()=>{},controller:null},configurable:true});
      localStorage.setItem('fastingTracker.setupGuide',JSON.stringify({version:1,started:true,dismissed:false,completed:false,currentStep:5,awaitStandalone:false}));
    }""")
    preselect.set_content(inlined_html(),wait_until='domcontentloaded')
    preselect.wait_for_function("!document.querySelector('#setupStepNotifications').hidden",timeout=5000)
    if preselect.locator('#setupNotificationWeighToggle').is_checked():
        print('FAIL: fresh onboarding weigh-in reminder unexpectedly on'); sys.exit(1)
    if preselect.locator('#setupNotificationWeighDailyBtn').is_disabled():
        print('FAIL: onboarding cadence is disabled while reminder is off'); sys.exit(1)
    preselect.locator('#setupNotificationWeighDailyBtn').click()
    preselect.wait_for_function("document.querySelector('#setupNotificationWeighCadence')?.value === 'daily'",timeout=5000)
    preselect.locator('#setupEnableNotificationsBtn').click()
    preselect.wait_for_function("!document.querySelector('#setupStepReady').hidden",timeout=5000)
    preselect.locator('#setupNextBtn').click()
    preselect.wait_for_function("document.querySelector('#setupModal').hidden",timeout=5000)
    preselect.locator('.tab[data-screen="settings"]').click()
    preselect.wait_for_function("document.querySelector('#notificationWeighCadence')?.value === 'daily'",timeout=5000)
    if preselect.locator('#notificationWeighDailyBtn').get_attribute('aria-pressed') != 'true':
        print('FAIL: onboarding preselected Daily cadence was not persisted into Settings'); sys.exit(1)

    # Unsupported environment: explain it, hide Enable, and still allow continuing.
    unsupported=browser.new_page(viewport={'width':390,'height':844})
    unsupported.evaluate(STORAGE_SHIM)
    unsupported.evaluate("""() => {
      Object.defineProperty(window,'Notification',{value:undefined,configurable:true});
      localStorage.setItem('fastingTracker.setupGuide',JSON.stringify({version:1,started:true,dismissed:false,completed:false,currentStep:5,awaitStandalone:false}));
    }""")
    unsupported.set_content(inlined_html(),wait_until='domcontentloaded')
    unsupported.wait_for_function("!document.querySelector('#setupStepNotifications').hidden",timeout=5000)
    if not unsupported.locator('#setupEnableNotificationsBtn').is_hidden():
        print('FAIL: Enable notifications remains visible when notifications are unsupported'); sys.exit(1)
    if 'not available' not in unsupported.locator('#setupNotificationStatus').inner_text().lower():
        print('FAIL: unsupported notification status is not explained'); sys.exit(1)
    unsupported.locator('#setupSkipNotificationsBtn').click()
    unsupported.wait_for_function("!document.querySelector('#setupStepReady').hidden",timeout=5000)

    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: onboarding notifications require explicit opt-in, preserve choices on Not now, and handle unsupported environments')
