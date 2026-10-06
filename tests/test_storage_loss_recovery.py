#!/usr/bin/env python3
"""External JSON restores a clean/empty installation after simulated site-data eviction."""
import json,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_perf_common import inlined_html, STORAGE_SHIM, build_data

VERSION='1.11.7'

def main():
    original=build_data(2);original['records'][0]['id']='keep-fast-1';original['records'][1]['id']='keep-fast-2';original['weights'][0]['id']='keep-weight-1';original['weights'][1]['id']='keep-weight-2'
    backup={'format':'fasting-tracker-backup','backupVersion':1,'appVersion':'1.9.2','exportedAt':'2026-10-05T12:00:00.000Z','data':original}
    empty=build_data(0);empty['records']=[];empty['weights']=[];empty['revision']=1;empty['updatedAt']='2026-10-05T12:01:00.000Z'
    with tempfile.TemporaryDirectory() as td, sync_playwright() as p:
        fp=Path(td)/'external.json';fp.write_text(json.dumps(backup),encoding='utf-8')
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':390,'height':844});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
        # A newly recreated empty PWA store models the state after browser/iOS site-data eviction.
        page.evaluate(STORAGE_SHIM);page.evaluate("d=>{__seedFastingDbV2(d,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.11.7'}));}",empty)
        page.set_content(inlined_html(),wait_until='domcontentloaded');page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.11.7'",timeout=20000)
        page.locator('.tab[data-screen="history"]').click();page.wait_for_timeout(100);assert page.locator('#historyList .historyRow').count()==0
        page.locator('.tab[data-screen="settings"]').click();page.locator('#importFile').set_input_files(str(fp))
        page.wait_for_function("!document.querySelector('#importPreviewModal').hidden",timeout=10000)
        page.locator('#importPreviewReplaceBtn').click();page.wait_for_timeout(500)
        page.locator('.tab[data-screen="history"]').click();page.wait_for_timeout(100);assert page.locator('#historyList .historyRow').count()==2
        page.locator('.tab[data-screen="weight"]').click();page.wait_for_timeout(100);assert page.locator('#weightHistoryList .historyRow').count()==2
        assert not errors,errors[:5]
        browser.close()
    print('PASS: external backup restores fasting and weight history into a clean installation after simulated storage loss')

if __name__=='__main__': main()
