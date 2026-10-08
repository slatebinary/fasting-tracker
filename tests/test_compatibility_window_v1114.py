#!/usr/bin/env python3
"""v1.12.2: bounded single-user compatibility window and legacy cleanup."""
import json, sys
from playwright.sync_api import sync_playwright
from browser_perf_common import STORAGE_SHIM, inlined_html

VERSION='1.12.2'
DATA={
  'dataVersion':1,'revision':4,'updatedAt':'2026-10-05T12:00:00.000Z','goalHours':16,
  'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,'activeCreatedAt':None,'activeModifiedAt':None,
  'records':[{'id':'legacy-fast','start':'2026-10-04T18:00:00.000Z','end':'2026-10-05T10:00:00.000Z','goalHours':16,'timeZone':'Europe/Sofia','createdAt':None,'modifiedAt':None,'editHistory':[]}],
  'deletedFasts':[],'weights':[{'id':'legacy-weight','when':'2026-10-05T07:00:00.000Z','kg':80,'timeZone':'Europe/Sofia','createdAt':None,'modifiedAt':None}],
  'deletedWeights':[],'weightUnit':'kg','targetWeightKg':75,'gamificationEnabled':True,
  'notificationPreferences':{'enabled':False,'targetReached':True,'backupDue':True,'longFastSafety':True,'weighIn':False,'weighInCadence':'weekly','cycleComplete':False},
  'language':'en','appearance':'system','iconChoice':'plate'
}

def db_state(page):
    return page.evaluate("""() => new Promise((resolve,reject)=>{
      const q=indexedDB.open('FastingTrackerDB',2);q.onerror=()=>reject(q.error);q.onsuccess=()=>{
        const db=q.result,tx=db.transaction(['state','records','weights','snapshotMeta'],'readonly'),out={};let n=5;
        const done=()=>{if(--n===0)resolve(out)};
        for(const name of ['records','weights','snapshotMeta']){const r=tx.objectStore(name).getAll();r.onerror=()=>reject(r.error);r.onsuccess=()=>{out[name]=r.result;done();};}
        for(const key of ['settings','primary']){const r=tx.objectStore('state').get(key);r.onerror=()=>reject(r.error);r.onsuccess=()=>{out[key]=r.result||null;done();};}
      };
    })""")

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    # Generation 1: primary localStorage remains importable, but obsolete localStorage snapshots do not.
    page=browser.new_page(viewport={'width':390,'height':844});page.evaluate(STORAGE_SHIM)
    page.evaluate("""d=>{
      localStorage.setItem('fastingTracker.data',JSON.stringify(d));
      localStorage.setItem('fastingTracker.snapshots',JSON.stringify([{id:'old-snap',createdAt:'2026-09-01T00:00:00.000Z',data:d}]));
      localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.7.0'}));
    }""",DATA)
    page.set_content(inlined_html(),wait_until='domcontentloaded');page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent==='v{VERSION}'",timeout=20000);page.wait_for_timeout(300)
    st=db_state(page)
    assert st['settings'] and st['settings']['storageGeneration']==3, st['settings']
    assert st['primary'] is None
    assert [r['id'] for r in st['records']]==['legacy-fast'] and [w['id'] for w in st['weights']]==['legacy-weight']
    assert page.evaluate("localStorage.getItem('fastingTracker.data')") is None
    assert page.evaluate("localStorage.getItem('fastingTracker.snapshots')") is None
    assert all(x.get('id')!='old-snap' for x in st['snapshotMeta']), st['snapshotMeta']
    migration=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.appMeta')||'{}').lastStorageMigration")
    assert migration and migration['fromGeneration']==1 and migration['toGeneration']==3 and migration['source']=='localstorage', migration
    page.close()

    # Current record stores created before the marker are stamped without losing records.
    page=browser.new_page(viewport={'width':390,'height':844});page.evaluate(STORAGE_SHIM)
    page.evaluate("d=>{__seedFastingDbV2(d,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.11.3'}));}",DATA)
    page.set_content(inlined_html(),wait_until='domcontentloaded');page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent==='v{VERSION}'",timeout=20000);page.wait_for_timeout(300)
    st=db_state(page)
    assert st['settings']['storageGeneration']==3
    assert [r['id'] for r in st['records']]==['legacy-fast'] and [w['id'] for w in st['weights']]==['legacy-weight']
    page.close();browser.close()

print('PASS: v1.12.2 compatibility window migrates supported primary layouts once, stamps current stores, and retires obsolete snapshots')
