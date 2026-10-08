#!/usr/bin/env python3
"""Regression: completed-fast corrections preserve identity, audit previous values, confirm material changes and recalculate XP."""
import json, sys
from datetime import datetime, timedelta
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


def shift_local(value, minutes):
    return (datetime.fromisoformat(value) + timedelta(minutes=minutes)).strftime('%Y-%m-%dT%H:%M')


data=build_data(1)
data['weights']=[]
original=dict(data['records'][0])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; dialogs=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    def on_dialog(d):
        dialogs.append(d.message)
        d.accept()
    page.on('dialog',on_dialog)
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDbV2(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.12.2'})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.12.2'",timeout=20000)

    # Small correction: move the whole interval by five minutes. Duration/goal outcome stay unchanged,
    # so this should save without a confirmation dialog.
    page.locator('.tab[data-screen="history"]').click()
    row=page.locator('#historyList .historyRow').first
    row.locator('.secondary').first.click()
    start0=page.locator('#entryStart').input_value(); end0=page.locator('#entryEnd').input_value()
    page.locator('#entryStart').fill(shift_local(start0,5)); page.locator('#entryEnd').fill(shift_local(end0,5))
    page.locator('#entrySaveBtn').click()
    page.wait_for_function("document.querySelector('#entryModal').hidden === true")
    page.wait_for_timeout(150)
    if dialogs:
        print('FAIL: minor five-minute correction unexpectedly required confirmation'); sys.exit(1)
    primary=read_primary(page); rec=primary['records'][0]
    if rec['id'] != original['id'] or len(rec.get('editHistory',[])) != 1:
        print('FAIL: minor correction did not preserve ID/audit history',rec); sys.exit(1)
    first_audit=rec['editHistory'][0]
    if first_audit.get('start') != original['start'] or first_audit.get('end') != original['end'] or first_audit.get('goalHours') != original['goalHours']:
        print('FAIL: first edit audit did not retain original values',first_audit); sys.exit(1)
    if 'Edited' not in page.locator('#historyList .historyRow').first.inner_text():
        print('FAIL: edited record is not visibly marked in History'); sys.exit(1)
    if page.locator('#gSummaryXP').inner_text().strip() != '10 XP':
        print('FAIL: minor correction unexpectedly changed XP'); sys.exit(1)

    # Material correction: shorten the end by 60 minutes. This changes duration and target outcome,
    # so confirmation must appear and all derived gamification data must recalculate.
    page.locator('#historyList .historyRow').first.locator('.secondary').first.click()
    before_material_start=page.locator('#entryStart').input_value(); before_material_end=page.locator('#entryEnd').input_value()
    page.locator('#entryEnd').fill(shift_local(before_material_end,-60))
    page.locator('#entrySaveBtn').click()
    page.wait_for_function("document.querySelector('#entryModal').hidden === true")
    page.wait_for_timeout(150)
    if len(dialogs) != 1 or 'substantial' not in dialogs[0].lower():
        print('FAIL: material correction did not request the intended confirmation',dialogs); sys.exit(1)
    primary=read_primary(page); rec=primary['records'][0]
    if rec['id'] != original['id'] or len(rec.get('editHistory',[])) != 2 or not rec.get('modifiedAt'):
        print('FAIL: material correction did not preserve identity/audit metadata',rec); sys.exit(1)
    second_audit=rec['editHistory'][1]
    expected_start=datetime.fromisoformat(before_material_start).replace(tzinfo=None)
    expected_end=datetime.fromisoformat(before_material_end).replace(tzinfo=None)
    # Audit is UTC ISO for this UTC-seeded record.
    if not second_audit.get('start','').startswith(expected_start.strftime('%Y-%m-%dT%H:%M')) or not second_audit.get('end','').startswith(expected_end.strftime('%Y-%m-%dT%H:%M')):
        print('FAIL: second edit audit did not retain the immediately previous values',second_audit); sys.exit(1)
    if primary.get('activeStart') is not None:
        print('FAIL: editing a completed fast altered active-fast state'); sys.exit(1)
    page.locator('.tab[data-screen="fasting"]').click()
    page.wait_for_function("document.querySelector('#gSummaryXP')?.textContent.trim() === '0 XP'",timeout=5000)
    xp_now=page.locator('#gSummaryXP').inner_text().strip()
    if xp_now != '0 XP':
        print('FAIL: XP did not recalculate after target outcome changed',xp_now,'record',rec); sys.exit(1)

    # The external JSON backup must carry the edit audit trail.
    page.evaluate("""() => {
      Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});
      Object.defineProperty(navigator,'share',{value:async payload=>{ window.__backupText=await payload.files[0].text(); },configurable:true});
    }""")
    page.locator('.tab[data-screen="settings"]').click(); page.locator('#settingsGroupData > summary').click(); page.locator('#exportBtn').click()
    page.wait_for_function("typeof window.__backupText === 'string'",timeout=5000)
    exported=json.loads(page.evaluate('window.__backupText'))
    exp=exported['data']['records'][0]
    if exp.get('id') != original['id'] or len(exp.get('editHistory',[])) != 2:
        print('FAIL: JSON backup omitted completed-fast edit audit history'); sys.exit(1)

    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: completed-fast edits preserve ID/audit history, confirm material changes and recalculate derived data')
