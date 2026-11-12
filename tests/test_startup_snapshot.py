#!/usr/bin/env python3
"""Regression: first launch after a legacy/localStorage release must not report a false snapshot failure."""
import json, sys
from pathlib import Path
CURRENT_VERSION=json.loads((Path(__file__).resolve().parents[1] / 'version.json').read_text(encoding='utf-8'))['version']
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
    page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent === 'v{CURRENT_VERSION}'",timeout=20000)
    page.wait_for_timeout(300)
    if errors:
        print('FAIL: startup browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    bad=[m for m in dialogs if 'recovery snapshot could not be saved' in m.lower()]
    if bad:
        print('FAIL: false recovery snapshot failure alert: '+bad[0]); sys.exit(1)
    if page.locator('#recoveryBanner').is_visible():
        print('FAIL: valid migrated data entered Recovery mode'); sys.exit(1)
    # The migrated data should remain available and snapshot UI should no longer show a failure state.
    page.locator('.tab[data-screen="settings"]').click(); page.locator('#settingsGroupData > summary').click()
    page.wait_for_timeout(100)
    status=page.locator('#snapshotStatus').inner_text()
    if 'could not' in status.lower() or 'failed' in status.lower():
        print('FAIL: snapshot status reports failure after successful startup: '+status); sys.exit(1)
    browser.close()
print('PASS: startup migration snapshot does not trigger false failure alert')

# v1.17.93: complete internal recovery snapshot restore regression.
def test_internal_snapshot_restore_lifecycle():
    d=build_data(2)
    d['activeStart']='2026-11-12T10:00:00.000Z'; d['activeGoalHours']=20; d['activeTimeZone']='Europe/Sofia'
    d['activeCreatedAt']='2026-11-12T10:00:00.000Z'; d['activeModifiedAt']='2026-11-12T10:15:00.000Z'
    d['records'][0]['editHistory']=[{'at':'2026-11-01T10:00:00.000Z','field':'goalHours','from':16,'to':18,'reason':'test audit'}]
    d['deletedFasts']=[{'id':'deleted-fast-audit','start':'2026-10-20T10:00:00.000Z','end':'2026-10-21T02:00:00.000Z','goalHours':16,'timeZone':'UTC','deletedAt':'2026-10-21T03:00:00.000Z','deleteReason':'test deletion','editHistory':[{'at':'2026-10-20T12:00:00.000Z','field':'goalHours','from':16,'to':17,'reason':'audit'}]}]
    d['deletedWeights']=[{'id':'deleted-weight-audit','when':'2026-10-22T08:00:00.000Z','kg':79.2,'timeZone':'UTC','deletedAt':'2026-10-22T09:00:00.000Z','deleteReason':'test deletion'}]
    d['weights'][0]['note']='snapshot-weight-note'; expected=json.loads(json.dumps(d))
    with sync_playwright() as p:
      browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
      page=browser.new_page(viewport={'width':390,'height':844}); errors=[]; dialogs=[]
      page.on('pageerror',lambda e:errors.append(str(e))); page.on('dialog',lambda dlg:(dialogs.append(dlg.message),dlg.accept()))
      page.evaluate(STORAGE_SHIM); page.evaluate("v=>localStorage.setItem('fastingTracker.data',v)",json.dumps(d,separators=(',',':')))
      page.set_content(inlined_html(),wait_until='domcontentloaded')
      page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent==='v{CURRENT_VERSION}'",timeout=25000)
      page.wait_for_function("()=>typeof save==='function'",timeout=15000)
      page.locator('#recoveryBanner').evaluate("el=>el.hidden=false"); page.locator('#recoverySnapshotsBtn').click(); page.locator('#snapshotCreateNowBtn').click()
      page.wait_for_function("()=>loadSnapshots().length>=1",timeout=15000)
      page.evaluate("""() => {data.records=[];data.deletedFasts=[];data.weights=[];data.deletedWeights=[];data.activeStart=null;data.activeGoalHours=null;data.activeTimeZone=null;data.activeCreatedAt=null;data.activeModifiedAt=null;if(!save({force:true}))throw new Error('Mutation persistence failed');}""")
      page.wait_for_function("()=>data.records.length===0 && data.weights.length===0 && !data.activeStart",timeout=15000)
      page.locator('#snapshotCloseBtn').click(); page.locator('#recoverySnapshotsBtn').click(); page.locator('#snapshotList button').first.click()
      page.wait_for_function("()=>!document.querySelector('#snapshotPreviewModal').hidden",timeout=10000)
      page.locator('#snapshotPreviewRestoreBtn').click()
      page.wait_for_function("()=>document.querySelector('#snapshotPreviewModal').hidden",timeout=15000)
      page.wait_for_function("()=>data.records.length===2 && data.deletedFasts.length===1 && data.weights.length===2 && data.deletedWeights.length===1 && !!data.activeStart",timeout=20000)
      restored=page.evaluate("()=>({records:data.records,deletedFasts:data.deletedFasts,weights:data.weights,deletedWeights:data.deletedWeights,activeStart:data.activeStart,activeGoalHours:data.activeGoalHours,activeTimeZone:data.activeTimeZone})")
      assert restored['records']==expected['records'],'completed fasting records/edit audit not restored'
      assert restored['deletedFasts']==expected['deletedFasts'],'deleted fasting audit metadata not restored'
      assert restored['weights']==expected['weights'],'weight records/notes not restored'
      assert restored['deletedWeights']==expected['deletedWeights'],'deleted weight audit metadata not restored'
      assert restored['activeStart']==expected['activeStart'] and restored['activeGoalHours']==20 and restored['activeTimeZone']=='Europe/Sofia','active fast metadata not restored'
      page.wait_for_function("()=>loadSnapshots().some(s=>s.reason==='before restoring another snapshot')",timeout=15000)
      page.reload(); page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent==='v{CURRENT_VERSION}'",timeout=25000)
      page.wait_for_function("()=>data.records.length===2 && data.deletedFasts.length===1 && data.weights.length===2 && data.deletedWeights.length===1 && !!data.activeStart",timeout=20000)
      if errors: raise AssertionError('browser errors: '+' | '.join(errors[:5]))
      assert any('snapshot restored' in x.lower() for x in dialogs),'restore confirmation missing'
      print('PASS: active fast, completed/deleted fasts and weights with audit metadata restored; safety snapshot and reload persistence verified.')
      browser.close()

test_internal_snapshot_restore_lifecycle()
