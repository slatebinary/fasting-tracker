#!/usr/bin/env python3
"""Every supported external backup schema remains restorable in v1.11.7."""
import json, tempfile, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_perf_common import inlined_html, STORAGE_SHIM, build_data

VERSION='1.11.7'

def stable(v):
    return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)

def fnv1a64(text):
    h=0xcbf29ce484222325
    for b in text.encode('utf-8'):
        h^=b; h=(h*0x100000001b3)&0xffffffffffffffff
    return f'{h:016x}'

def manifest(d):
    return {
      'dataVersion':d.get('dataVersion',1),'databaseSchemaVersion':2,
      'activeFasts':1 if d.get('activeStart') else 0,
      'fastingRecords':len(d.get('records',[])),'deletedFasts':len(d.get('deletedFasts',[])),
      'weightRecords':len(d.get('weights',[])),'deletedWeights':len(d.get('deletedWeights',[])),
      'fastEditAuditEntries':sum(len(r.get('editHistory',[])) for r in d.get('records',[])+d.get('deletedFasts',[])),
      'recoverySnapshotsOnDevice':0,'recoverySnapshotsEmbedded':0
    }

def make_backup(schema,d):
    base={'format':'fasting-tracker-backup','backupVersion':schema,'appVersion':'1.11.7','exportedAt':'2026-10-05T12:00:00.000Z','data':d}
    if schema==2:
        base['manifest']=manifest(d)
        base['integrity']={'scope':'data','algorithm':'FNV-1a-64','digest':fnv1a64(stable(d))}
    return base

def inspect(page):
    return page.evaluate("""() => new Promise((resolve,reject)=>{
      const q=indexedDB.open('FastingTrackerDB',2);q.onerror=()=>reject(q.error);q.onsuccess=()=>{
        const db=q.result, tx=db.transaction(['records','weights'],'readonly');
        const a=tx.objectStore('records').getAll(),b=tx.objectStore('weights').getAll();let r,w;
        const done=()=>{if(r&&w)resolve({records:r,weights:w})};
        a.onsuccess=()=>{r=a.result;done()};b.onsuccess=()=>{w=b.result;done()};a.onerror=b.onerror=()=>reject(a.error||b.error);
      };
    })""")

def main():
    restored=build_data(1); restored['records'][0]['id']='restored-fast';restored['weights'][0]['id']='restored-weight';restored['weights'][0]['kg']=80.25
    current=build_data(1);current['records'][0]['id']='current-fast';current['weights'][0]['id']='current-weight'
    with tempfile.TemporaryDirectory() as td, sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        for schema in (1,2):
            f=Path(td)/f'backup-v{schema}.json'; f.write_text(json.dumps(make_backup(schema,restored),ensure_ascii=False),encoding='utf-8')
            page=browser.new_page(viewport={'width':390,'height':844});errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('dialog',lambda d:d.accept())
            page.evaluate(STORAGE_SHIM)
            page.evaluate("d=>{__seedFastingDbV2(d,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.11.7'}));}",current)
            page.set_content(inlined_html(),wait_until='domcontentloaded')
            page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.11.7'",timeout=20000)
            page.locator('#importFile').set_input_files(str(f))
            page.wait_for_function("!document.querySelector('#importPreviewModal').hidden",timeout=10000)
            meta=page.locator('#importPreviewMeta').inner_text().lower()
            if schema==1: assert ('legacy' in meta or 'v1' in meta or 'not checksum' in meta), meta
            else: assert ('verified' in meta or 'checksum' in meta), meta
            page.locator('#importPreviewReplaceBtn').click();page.wait_for_timeout(500)
            state=inspect(page)
            assert [r['id'] for r in state['records']]==['restored-fast'], (schema,state)
            assert [w['id'] for w in state['weights']]==['restored-weight'], (schema,state)
            assert not errors,(schema,errors[:5])
            page.close()
        browser.close()
    print('PASS: backup restore matrix covers every supported external backup schema (v1 and v2)')

if __name__=='__main__': main()
