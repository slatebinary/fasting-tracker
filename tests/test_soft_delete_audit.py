#!/usr/bin/env python3
"""Regression: deleted fasting records remain auditable and are exported until permanently deleted."""
import json, sys
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)


def read_primary(page):
    return page.evaluate("""() => new Promise((resolve,reject) => {
      const req=indexedDB.open('FastingTrackerDB',2);
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        const db=req.result, names=['records','deletedFasts','weights','deletedWeights'];
        const tx=db.transaction(['state',...names],'readonly');
        const sreq=tx.objectStore('state').get('settings');
        const result={}; let pending=names.length+1;
        const done=()=>{ if(--pending===0) resolve({...sreq.result?.data,...result}); };
        sreq.onerror=()=>reject(sreq.error); sreq.onsuccess=done;
        for(const name of names){const r=tx.objectStore(name).getAll();r.onerror=()=>reject(r.error);r.onsuccess=()=>{result[name]=r.result;done();};}
      };
    })""")



data=build_data(3)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; dialogs=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    def handle_dialog(d):
        dialogs.append(d.message); d.accept()
    page.on('dialog',handle_dialog)
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.12.0',seenAt:new Date().toISOString()})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.12.0'",timeout=20000)

    page.locator('.tab[data-screen="history"]').click()
    page.wait_for_function("document.querySelectorAll('#historyList .historyRow').length === 3",timeout=5000)
    # Determine the newest record ID from the seeded ordering used by the UI.
    newest=max(data['records'],key=lambda r:r['end'])['id']
    page.locator('#historyList .historyRow').first.locator('.dangerText').click()
    page.wait_for_function("document.querySelectorAll('#historyList .historyRow').length === 2 && !document.querySelector('#deletedFastsCard').hidden",timeout=5000)
    page.wait_for_timeout(120)

    primary=read_primary(page)
    if len(primary.get('deletedFasts',[])) != 1:
        print('FAIL: soft delete did not persist one deleted-fast audit record'); sys.exit(1)
    tomb=primary['deletedFasts'][0]
    required=['id','start','end','goalHours','timeZone','deletedAt','deletedTimeZone','deletionReason']
    if tomb.get('id') != newest or tomb.get('deleted') is not True or any(k not in tomb for k in required):
        print('FAIL: deleted-fast audit record is incomplete: '+json.dumps(tomb,sort_keys=True)); sys.exit(1)
    if any(r['id']==newest for r in primary['records']):
        print('FAIL: deleted fast remained in live history'); sys.exit(1)

    # Deleted fasts must not count in normal statistics.
    page.locator('.tab[data-screen="stats"]').click()
    page.wait_for_function("document.querySelector('#mTotal')?.textContent.trim() === '2'",timeout=5000)

    # Capture the real external JSON backup through the Web Share file path.
    page.evaluate("""() => {
      Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});
      Object.defineProperty(navigator,'share',{value:async payload=>{ window.__backupText=await payload.files[0].text(); },configurable:true});
    }""")
    page.locator('.tab[data-screen="settings"]').click(); page.locator('#settingsGroupData > summary').click()
    page.locator('#exportBtn').click()
    page.wait_for_function("typeof window.__backupText === 'string'",timeout=5000)
    exported=json.loads(page.evaluate("window.__backupText"))
    exp_deleted=exported.get('data',{}).get('deletedFasts',[])
    if len(exp_deleted)!=1 or exp_deleted[0].get('id')!=newest or exp_deleted[0].get('deleted') is not True or not exp_deleted[0].get('deletedAt'):
        print('FAIL: JSON backup did not retain the deleted-fast audit trail'); sys.exit(1)

    # Restore removes it from Recently deleted and returns it to live history/statistics.
    page.locator('.tab[data-screen="history"]').click()
    page.locator('#deletedFastsList .secondary').first.click()
    page.wait_for_function("document.querySelectorAll('#historyList .historyRow').length === 3 && document.querySelector('#deletedFastsCard').hidden",timeout=5000)
    page.locator('.tab[data-screen="stats"]').click()
    page.wait_for_function("document.querySelector('#mTotal')?.textContent.trim() === '3'",timeout=5000)

    # Delete again, then permanently erase the audit record.
    page.locator('.tab[data-screen="history"]').click()
    page.locator('#historyList .historyRow').first.locator('.dangerText').click()
    page.wait_for_function("!document.querySelector('#deletedFastsCard').hidden",timeout=5000)
    page.locator('#deletedFastsList .dangerText').first.click()
    page.wait_for_function("document.querySelector('#deletedFastsCard').hidden",timeout=5000)
    page.wait_for_timeout(120)
    primary=read_primary(page)
    if primary.get('deletedFasts'):
        print('FAIL: permanent deletion retained the audit tombstone'); sys.exit(1)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: deleted fasts remain audited/exported until restore or permanent deletion')
