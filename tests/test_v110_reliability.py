#!/usr/bin/env python3
from pathlib import Path
import hashlib, json, tempfile
from playwright.sync_api import sync_playwright
from browser_perf_common import inlined_html, STORAGE_SHIM

VERSION='1.12.2'

def seed_data():
    return {
      'dataVersion':1,'revision':7,'updatedAt':'2026-10-01T17:00:00.000Z','goalHours':8,
      'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,'activeCreatedAt':None,'activeModifiedAt':None,
      'records':[{
        'id':'fast-1','start':'2026-10-01T08:00:00.000Z','end':'2026-10-01T16:00:00.000Z','goalHours':8,'timeZone':'UTC',
        'createdAt':'2026-10-01T16:00:00.000Z','modifiedAt':'2026-10-02T09:00:00.000Z',
        'editHistory':[{'editedAt':'2026-10-02T09:00:00.000Z','editedTimeZone':'UTC','start':'2026-10-01T07:30:00.000Z','end':'2026-10-01T15:30:00.000Z','goalHours':8,'timeZone':'UTC'}]
      }],
      'deletedFasts':[],
      'weights':[{'id':'weight-1','when':'2026-10-01T07:00:00.000Z','kg':80,'timeZone':'UTC','createdAt':'2026-10-01T07:00:00.000Z','modifiedAt':None}],
      'deletedWeights':[],'weightUnit':'kg','targetWeightKg':75,'gamificationEnabled':True,
      'notificationPreferences':{'enabled':False,'targetReached':True,'backupDue':True,'longFastSafety':True,'weighIn':False,'weighInCadence':'weekly','cycleComplete':False},
      'language':'en','appearance':'system','iconChoice':'plate'
    }

def stable_py(v):
    return json.dumps(v, sort_keys=True, separators=(',',':'), ensure_ascii=False)

def fnv1a64(text):
    h=0xcbf29ce484222325
    for b in text.encode('utf-8'):
        h ^= b
        h=(h*0x100000001b3)&0xffffffffffffffff
    return f'{h:016x}'

def main():
    data=seed_data()
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(accept_downloads=True)
        page.evaluate(STORAGE_SHIM)
        page.evaluate("data=>{__seedFastingDbV2(data,[['2026-10-01',28800000]]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.12.2'}));}",data)
        page.set_content(inlined_html(),wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.12.2'",timeout=20000)

        page.locator('.tab[data-screen="settings"]').click(); page.locator('#settingsGroupData > summary').click(); page.locator('#settingsStorageDetails > summary').click(); page.locator('#settingsGroupAdvanced > summary').click()
        page.wait_for_function("!document.querySelector('#settings').hidden && document.querySelector('#healthRecordCount')?.textContent!=='—'")
        assert 'Current data' in page.locator('#dataLocationsCard').inner_text()
        summary=page.locator('#backupContentSummary').inner_text()
        assert '1 fasts' in summary and '1 weights' in summary

        page.locator('#integrityCheckBtn').click()
        page.wait_for_function("!document.querySelector('#integrityModal').hidden")
        assert 'passed' in page.locator('#integritySummary').inner_text().lower()
        page.locator('#integrityCloseBtn').click()

        before_count=int(page.locator('#healthSnapshotCount').inner_text().replace(',', ''))
        page.locator('#createSnapshotBtn').click()
        page.locator('#manualSnapshotSaveBtn').click()
        page.wait_for_function("n=>Number(document.querySelector('#healthSnapshotCount')?.textContent.replace(/,/g,''))===n+1",arg=before_count,timeout=10000)
        assert 'newest' in page.locator('#snapshotTransparency').inner_text().lower()
        page.locator('#restoreSnapshotBtn').click()
        page.wait_for_function("!document.querySelector('#snapshotModal').hidden")
        assert 'Newest' in page.locator('#snapshotModalSummary').inner_text()
        page.locator('#snapshotList button').first.click()
        page.wait_for_function("!document.querySelector('#snapshotPreviewModal').hidden")
        assert '1 active fasts' in page.locator('#snapshotPreviewCounts').inner_text()
        page.locator('#snapshotPreviewCancelBtn').click()
        page.locator('#snapshotCloseBtn').click()

        page.locator('.tab[data-screen="history"]').click()
        page.locator('#historyList .textButton').first.click()
        page.wait_for_function("!document.querySelector('#editAuditModal').hidden")
        text=page.locator('#editAuditModal').inner_text()
        assert 'Previous values' in text and 'Correction 1' in text
        page.locator('#editAuditCloseBtn').click()
        page.locator('.tab[data-screen="settings"]').click()

        page.on('dialog',lambda d:d.accept())
        with page.expect_download(timeout=10000) as info:
            page.locator('#exportBtn').click()
        path=info.value.path()
        backup=json.loads(Path(path).read_text(encoding='utf-8'))
        assert backup['backupVersion']==2
        assert backup['manifest']['fastingRecords']==1 and backup['manifest']['weightRecords']==1
        assert backup['manifest']['recoverySnapshotsOnDevice']>=1 and backup['manifest']['recoverySnapshotsEmbedded']==0
        integ=backup['integrity']; canonical=stable_py(backup['data'])
        expected=hashlib.sha256(canonical.encode()).hexdigest() if integ['algorithm']=='SHA-256' else fnv1a64(canonical)
        assert integ['digest']==expected

        with page.expect_download(timeout=10000) as csv_info:
            page.locator('#exportFastCsvBtn').click()
        csv=Path(csv_info.value.path()).read_text(encoding='utf-8-sig')
        assert csv.startswith('id,start,start_local,end,end_local,duration_hours,target_hours') and 'fast-1' in csv
        browser.close()
    print('v1.12.2 reliability UI/backup/CSV checks passed')

if __name__=='__main__': main()
