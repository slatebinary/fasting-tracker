#!/usr/bin/env python3
"""Regression: reminder snooze defaults, custom delays and due reappearance."""
import json, sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM

APP_VERSION=json.loads((Path(__file__).resolve().parents[1]/'version.json').read_text())['version']
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

now=datetime.now(timezone.utc)
details=[
    {'id':'fasting-weigh-snooze-test','kind':'weigh-in','screen':'weight','createdAt':now.isoformat().replace('+00:00','Z'),'params':{'cadence':'weekly'}},
    {'id':'fasting-target-snooze-test','kind':'target','screen':'fasting','createdAt':now.isoformat().replace('+00:00','Z'),'params':{'targetHours':18}},
]
data=build_data(0)
data['notificationPreferences']={
    'enabled':False,'targetReached':True,'backupDue':True,'longFastSafety':True,
    'weighIn':False,'weighInCadence':'weekly','cycleComplete':False,
    'weightSnoozeMinutes':60,'fastingSnoozeMinutes':60,
}

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("""() => {
      window.__ftNotifications=[];
      const MockNotification={permission:'granted',requestPermission:async()=> 'granted'};
      Object.defineProperty(window,'Notification',{value:MockNotification,configurable:true});
      const registration={showNotification:async(title,options)=>window.__ftNotifications.push({title,options})};
      const sw={ready:Promise.resolve(registration),register:async()=>({}),addEventListener:()=>{},controller:null};
      Object.defineProperty(navigator,'serviceWorker',{value:sw,configurable:true});
    }""")
    page.evaluate("""arg => {
      __seedFastingDbV2(arg.data, []);
      localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:arg.version,seenAt:new Date().toISOString()}));
      localStorage.setItem('fastingTracker.notificationState', JSON.stringify({details:arg.details}));
    }""", {'data':data,'version':APP_VERSION,'details':details})
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("v => document.querySelector('#appVersionLabel')?.textContent === 'v' + v",arg=APP_VERSION,timeout=20000)

    weigh=page.locator('[data-notification-detail-id="fasting-weigh-snooze-test"]')
    target=page.locator('[data-notification-detail-id="fasting-target-snooze-test"]')
    page.wait_for_function("document.querySelectorAll('#notificationDetailStack .notificationDetailCard').length === 2",timeout=5000)
    if weigh.locator('.notificationDetailSnoozeDuration').input_value()!='60':
        print('FAIL: weigh-in snooze default should be 1 hour'); sys.exit(1)
    if target.locator('.notificationDetailSnoozeDuration').input_value()!='60':
        print('FAIL: fasting snooze default should be 1 hour'); sys.exit(1)

    page.locator('.tab[data-screen="settings"]').click()
    page.locator('#settingsGroupNotifications > summary').click()
    page.wait_for_function("document.querySelector('#notificationWeightSnoozeDefault option') && document.querySelector('#notificationFastingSnoozeDefault option')")
    if page.locator('#notificationWeightSnoozeDefault').input_value()!='60' or page.locator('#notificationFastingSnoozeDefault').input_value()!='60':
        print('FAIL: separate Settings snooze defaults are missing or incorrect'); sys.exit(1)
    page.locator('#notificationWeightSnoozeDefault').select_option('4320')
    page.locator('#notificationFastingSnoozeDefault').select_option('240')
    if page.locator('#notificationWeightSnoozeDefault').input_value()!='4320' or page.locator('#notificationFastingSnoozeDefault').input_value()!='240':
        print('FAIL: Settings snooze defaults could not be changed independently'); sys.exit(1)

    # Snooze one reminder for a custom 30-minute interval.
    weigh.locator('.notificationDetailSnoozeDuration').select_option('30')
    weigh.locator('.notificationDetailSnooze').click()
    page.wait_for_function("!document.querySelector('[data-notification-detail-id=\\\"fasting-weigh-snooze-test\\\"]')")
    stored=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.notificationState')||'{}')")
    pending=stored.get('snoozedDetails',[])
    if len(pending)!=1 or pending[0].get('id')!='fasting-weigh-snooze-test':
        print('FAIL: snoozed reminder was not persisted:',pending); sys.exit(1)
    due=datetime.now(timezone.utc)-timedelta(seconds=1)
    pending[0]['snoozedUntil']=due.isoformat().replace('+00:00','Z')
    page.evaluate("state => { localStorage.setItem('fastingTracker.notificationState',JSON.stringify(state)); document.dispatchEvent(new Event('visibilitychange')); }",stored)
    page.wait_for_function("!!document.querySelector('[data-notification-detail-id=\\\"fasting-weigh-snooze-test\\\"]')",timeout=5000)
    page.wait_for_function("window.__ftNotifications?.length === 1",timeout=3000)
    restored=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.notificationState')||'{}')")
    if restored.get('snoozedDetails'):
        print('FAIL: due reminder remained in snoozed queue:',restored.get('snoozedDetails')); sys.exit(1)
    if not any(x.get('id')=='fasting-weigh-snooze-test' for x in restored.get('details',[])):
        print('FAIL: due reminder did not return to notification details'); sys.exit(1)
    device_notifications=page.evaluate("window.__ftNotifications")
    if len(device_notifications)!=1:
        print('FAIL: due reminder should emit one device notification:',device_notifications); sys.exit(1)
    notice=device_notifications[0]
    if len(notice['options']['body'])>72 or notice['options']['tag']!='fasting-weigh-snooze-test' or notice['options']['data']['detailId']!='fasting-weigh-snooze-test':
        print('FAIL: snoozed device reminder is too long or does not link to its detail:',notice); sys.exit(1)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:4])); sys.exit(1)
    browser.close()
print('PASS: independent snooze defaults, custom delay, persistence and due reappearance')
