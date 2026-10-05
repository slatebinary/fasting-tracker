#!/usr/bin/env python3
"""Regression matrix: older Fasting Tracker storage layouts migrate safely to v1.10.1."""
import json, sys
from playwright.sync_api import sync_playwright
from browser_perf_common import STORAGE_SHIM, inlined_html

VERSION='1.10.1'

def old_data(include_modern=False):
    d={
      'dataVersion':1,'revision':3,'updatedAt':'2026-09-01T12:00:00.000Z','goalHours':16,
      'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,
      'records':[{'id':'old-fast','start':'2026-08-31T18:00:00.000Z','end':'2026-09-01T10:00:00.000Z','goalHours':16,'timeZone':'Europe/Sofia'}],
      'weights':[{'id':'old-weight','when':'2026-09-01T07:00:00.000Z','kg':80.5,'timeZone':'Europe/Sofia'}],
      'weightUnit':'kg','targetWeightKg':75,'gamificationEnabled':True,'language':'en','appearance':'system'
    }
    if include_modern:
        d.update({'deletedFasts':[],'deletedWeights':[],'activeCreatedAt':None,'activeModifiedAt':None,
          'notificationPreferences':{'enabled':False,'targetReached':True,'backupDue':True,'longFastSafety':True,'weighIn':False,'weighInCadence':'weekly','cycleComplete':False},'iconChoice':'plate'})
    return d

def inspect(page):
    return page.evaluate("""() => new Promise((resolve,reject)=>{
      const q=indexedDB.open('FastingTrackerDB',2); q.onerror=()=>reject(q.error); q.onsuccess=()=>{
        const db=q.result, names=['state','records','deletedFasts','weights','deletedWeights','snapshotMeta','snapshotPayload'];
        const tx=db.transaction(names,'readonly'), out={}; let left=7;
        const done=()=>{if(--left===0)resolve(out)};
        for(const n of ['records','deletedFasts','weights','deletedWeights','snapshotMeta','snapshotPayload']){
          const r=tx.objectStore(n).getAll(); r.onerror=()=>reject(r.error); r.onsuccess=()=>{out[n]=r.result;done();};
        }
        const s=tx.objectStore('state').get('settings'); s.onerror=()=>reject(s.error); s.onsuccess=()=>{out.settings=s.result?.data||null;done();};
      };
    })""")

def run_case(browser, kind, last_version):
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.evaluate(STORAGE_SHIM)
    data=old_data(include_modern=(kind=='v2'))
    if kind=='localStorage':
        page.evaluate("d=>localStorage.setItem('fastingTracker.data',JSON.stringify(d))",data)
    elif kind=='v1':
        page.evaluate("d=>__seedFastingDb(d,[])",data)
    elif kind=='v2':
        page.evaluate("d=>__seedFastingDbV2(d,[['2026-09-01',36000000]])",data)
    else: raise AssertionError(kind)
    page.evaluate("v=>localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:v,seenAt:'2026-09-01T12:00:00.000Z'}))",last_version)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent==='v{VERSION}'",timeout=20000)
    page.wait_for_timeout(300)
    state=inspect(page)
    assert len(state['records'])==1 and state['records'][0]['id']=='old-fast', (kind,state['records'])
    assert len(state['weights'])==1 and state['weights'][0]['id']=='old-weight', (kind,state['weights'])
    assert state['settings']['dataVersion']==1 and 'deletedFasts' not in state['settings'], 'record arrays must live outside settings'
    # Every cross-version launch with meaningful data must leave at least one rollback snapshot.
    assert state['snapshotMeta'] and state['snapshotPayload'], f'{kind}: transition snapshot missing'
    assert {x['id'] for x in state['snapshotMeta']} == {x['id'] for x in state['snapshotPayload']}, f'{kind}: orphaned snapshot'
    assert not errors, f'{kind}: browser errors: {errors[:3]}'
    page.close()

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    # Very old localStorage, v1 IndexedDB primary blob, and current record-store layout while skipping releases.
    for case,last in [('localStorage','1.0.0'),('v1','1.8.0'),('v2','1.9.2')]:
        run_case(browser,case,last)
    browser.close()
print('PASS: migration matrix covers legacy localStorage, v1 blob, and v2 record stores')
