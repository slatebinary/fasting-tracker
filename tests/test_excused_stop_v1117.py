#!/usr/bin/env python3
"""Regression: unavoidable early stops are factual but neutral for consistency streaks."""
import json, sys
from datetime import datetime, timezone, timedelta
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
now=datetime.now(timezone.utc)
data['activeStart']=(now-timedelta(hours=2)).isoformat().replace('+00:00','Z')
data['activeGoalHours']=16
data['activeTimeZone']='UTC'
data['activeCreatedAt']=data['activeStart']
data['activeModifiedAt']=None

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; dialogs=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.on('dialog',lambda d:(dialogs.append(d.message),d.accept()))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDbV2(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.11.7'})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.11.7'",timeout=20000)
    page.wait_for_function("document.querySelector('#toggleFast')?.textContent.includes('Stop')",timeout=10000)
    if page.locator('#gSummaryXP').inner_text().strip() != '36 XP':
        print('FAIL: unexpected seed XP'); sys.exit(1)
    if not page.locator('#streakValue').inner_text().startswith('3'):
        print('FAIL: unexpected seed streak',page.locator('#streakValue').inner_text()); sys.exit(1)

    # Early stop exposes reason selector. Business/social is excused, but still a factual miss.
    page.locator('#toggleFast').click(); page.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    if page.locator('#stopReasonGroup').is_hidden():
        print('FAIL: early-stop reason selector was not shown'); sys.exit(1)
    page.locator('#stopReasonSelect').select_option('business-social')
    page.locator('#stopAndSaveBtn').click(); page.locator('#stopFastModal').wait_for(state='hidden',timeout=5000)
    page.wait_for_function("document.querySelector('#toggleFast')?.textContent.includes('Start')",timeout=5000)
    primary=read_primary(page); latest=max(primary['records'],key=lambda r:r['end'])
    if latest.get('stopReason')!='business-social':
        print('FAIL: stop reason not persisted',latest); sys.exit(1)
    if page.locator('#gSummaryXP').inner_text().strip() != '36 XP':
        print('FAIL: excused miss unexpectedly changed target XP'); sys.exit(1)
    if not page.locator('#streakValue').inner_text().startswith('3'):
        print('FAIL: excused miss broke the consistency streak',page.locator('#streakValue').inner_text()); sys.exit(1)

    page.locator('.tab[data-screen="history"]').click()
    page.wait_for_function("document.querySelectorAll('#historyList .historyRow').length >= 4",timeout=5000)
    top=page.locator('#historyList .historyRow').first
    if 'Excused stop' not in top.inner_text() or 'Business / social obligation' not in top.inner_text():
        print('FAIL: excused status/reason not visible in History',top.inner_text()); sys.exit(1)
    if 'Target reached' in top.inner_text():
        print('FAIL: excused stop was falsely shown as target reached'); sys.exit(1)

    # Editing reason later must be possible and auditable. Changing to personal choice makes streak break.
    top.locator('button.secondary').first.click()
    page.locator('#entryModal').wait_for(state='visible',timeout=5000)
    if page.locator('#entryStopReasonGroup').is_hidden() or page.locator('#entryStopReason').input_value()!='business-social':
        print('FAIL: edit modal did not restore early-stop reason'); sys.exit(1)
    page.locator('#entryStopReason').select_option('personal')
    page.locator('#entrySaveBtn').click(); page.locator('#entryModal').wait_for(state='hidden',timeout=5000)
    page.locator('.tab[data-screen="fasting"]').click()
    page.wait_for_function("document.querySelector('#streakValue')?.textContent.trim().startsWith('0')",timeout=5000)
    primary=read_primary(page); latest=max(primary['records'],key=lambda r:r['end'])
    if latest.get('stopReason')!='personal' or not latest.get('editHistory') or latest['editHistory'][-1].get('stopReason')!='business-social':
        print('FAIL: reason edit/audit was not preserved',latest); sys.exit(1)
    if page.locator('#gSummaryXP').inner_text().strip() != '36 XP':
        print('FAIL: personal missed target changed XP instead of only streak'); sys.exit(1)

    # JSON backup must include the classification/audit field.
    page.evaluate("""() => {
      Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});
      Object.defineProperty(navigator,'share',{value:async payload=>{ window.__backupText=await payload.files[0].text(); },configurable:true});
    }""")
    page.locator('.tab[data-screen="settings"]').click(); page.locator('#exportBtn').click()
    page.wait_for_function("typeof window.__backupText === 'string'",timeout=5000)
    exported=json.loads(page.evaluate('window.__backupText'))
    exp=max(exported['data']['records'],key=lambda r:r['end'])
    if exp.get('stopReason')!='personal' or exp.get('editHistory',[])[-1].get('stopReason')!='business-social':
        print('FAIL: JSON backup omitted stop reason/audit',exp); sys.exit(1)

    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: excused early stops stay factual, preserve streaks, remain editable/audited and export cleanly')
