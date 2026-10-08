#!/usr/bin/env python3
"""v1.12.1 date/time edge matrix through real backup import and integrity verification."""
import json,tempfile,sys
from playwright.sync_api import sync_playwright
from browser_perf_common import inlined_html, STORAGE_SHIM
VERSION='1.12.1'
RECORDS=[
 {'id':'leap','start':'2024-02-28T20:00:00.000Z','end':'2024-02-29T12:00:00.000Z','goalHours':16,'timeZone':'Europe/Sofia','createdAt':'2024-02-29T12:00:00.000Z','modifiedAt':None,'editHistory':[]},
 {'id':'midnight','start':'2026-03-15T20:30:00.000Z','end':'2026-03-16T12:30:00.000Z','goalHours':16,'timeZone':'Europe/Sofia','createdAt':'2026-03-16T12:30:00.000Z','modifiedAt':None,'editHistory':[]},
 {'id':'spring','start':'2026-03-28T18:00:00.000Z','end':'2026-03-29T10:00:00.000Z','goalHours':16,'timeZone':'Europe/Sofia','createdAt':'2026-03-29T10:00:00.000Z','modifiedAt':None,'editHistory':[]},
 {'id':'autumn','start':'2025-10-25T18:00:00.000Z','end':'2025-10-26T10:00:00.000Z','goalHours':16,'timeZone':'Europe/Sofia','createdAt':'2025-10-26T10:00:00.000Z','modifiedAt':None,'editHistory':[]},
 {'id':'long72','start':'2026-06-01T10:00:00.000Z','end':'2026-06-04T10:00:00.000Z','goalHours':72,'timeZone':'Europe/Sofia','createdAt':'2026-06-04T10:00:00.000Z','modifiedAt':None,'editHistory':[]},
 {'id':'travelNy','start':'2026-04-10T22:00:00.000Z','end':'2026-04-11T14:00:00.000Z','goalHours':16,'timeZone':'America/New_York','createdAt':'2026-04-11T14:00:00.000Z','modifiedAt':None,'editHistory':[]},
]

def main():
    empty={'dataVersion':1,'revision':0,'updatedAt':None,'goalHours':16,'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,'activeCreatedAt':None,'activeModifiedAt':None,'records':[],'deletedFasts':[],'weights':[],'deletedWeights':[],'weightUnit':'kg','targetWeightKg':None,'gamificationEnabled':True,'notificationPreferences':{'enabled':False,'targetReached':True,'backupDue':True,'longFastSafety':True,'weighIn':False,'weighInCadence':'weekly','cycleComplete':False},'language':'en','appearance':'system','iconChoice':'plate'}
    imported={**empty,'revision':7,'updatedAt':'2026-10-05T10:00:00.000Z','records':RECORDS}
    backup={'format':'fasting-tracker-backup','backupVersion':1,'appVersion':VERSION,'exportedAt':'2026-10-05T10:30:00.000Z','data':imported}
    with tempfile.NamedTemporaryFile('w',suffix='.json',delete=False,encoding='utf-8') as f: json.dump(backup,f); path=f.name
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.evaluate(STORAGE_SHIM);page.evaluate("d=>{__seedFastingDbV2(d,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.12.1'}));}",empty)
        page.set_content(inlined_html(),wait_until='domcontentloaded');page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.12.1'",timeout=20000)
        page.locator('.tab[data-screen="settings"]').click();page.locator('#settingsGroupData > summary').click();page.locator('#settingsGroupAdvanced > summary').click();page.wait_for_timeout(80)
        page.on('dialog',lambda d:d.accept())
        page.locator('#importFile').set_input_files(path);page.wait_for_timeout(120)
        assert page.locator('#importPreviewModal').is_visible();page.locator('#importPreviewReplaceBtn').click();page.wait_for_timeout(250)
        page.locator('#integrityCheckBtn').click();page.wait_for_timeout(350)
        assert page.locator('#integrityModal').is_visible()
        summary=page.locator('#integritySummary').inner_text().lower();assert 'no problems' in summary or 'passed' in summary,summary
        page.locator('#integrityCloseBtn').click();page.locator('.tab[data-screen="history"]').click();page.wait_for_timeout(100)
        text=page.locator('#historyList').inner_text();assert '72h' in text and page.locator('#historyList .historyRow').count()>=6
        assert not errors,errors[:5]
        browser.close()
    print('PASS: leap day, midnight crossing, spring/autumn DST, travel timezone and 72-hour fast survive import and integrity checks')
if __name__=='__main__':main()
