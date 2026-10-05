#!/usr/bin/env python3
"""v1.10.1 quality regression: filters/bulk UI, Undo, labeled recovery, backup freshness, diagnostics and keyboard accessibility."""
import sys
from playwright.sync_api import sync_playwright
from browser_perf_common import inlined_html, STORAGE_SHIM

VERSION='1.10.1'

def seed_data():
    return {
      'dataVersion':1,'revision':10,'updatedAt':'2026-10-05T10:00:00.000Z','goalHours':16,
      'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,'activeCreatedAt':None,'activeModifiedAt':None,
      'records':[
        {'id':'f-old','start':'2026-10-01T16:00:00.000Z','end':'2026-10-02T08:00:00.000Z','goalHours':16,'timeZone':'UTC','createdAt':'2026-10-02T08:00:00.000Z','modifiedAt':None,'editHistory':[]},
        {'id':'f-mid','start':'2026-10-02T14:00:00.000Z','end':'2026-10-03T08:00:00.000Z','goalHours':18,'timeZone':'UTC','createdAt':'2026-10-03T08:00:00.000Z','modifiedAt':'2026-10-03T09:00:00.000Z','editHistory':[{'editedAt':'2026-10-03T09:00:00.000Z','editedTimeZone':'UTC','start':'2026-10-02T15:00:00.000Z','end':'2026-10-03T08:00:00.000Z','goalHours':18,'timeZone':'UTC'}]},
        {'id':'f-new','start':'2026-10-03T12:00:00.000Z','end':'2026-10-04T08:00:00.000Z','goalHours':16,'timeZone':'UTC','createdAt':'2026-10-04T08:00:00.000Z','modifiedAt':None,'editHistory':[]}
      ],
      'deletedFasts':[],
      'weights':[
        {'id':'w-old','when':'2026-10-02T07:00:00.000Z','kg':80.2,'timeZone':'UTC','createdAt':'2026-10-02T07:00:00.000Z','modifiedAt':None},
        {'id':'w-new','when':'2026-10-04T07:00:00.000Z','kg':79.8,'timeZone':'UTC','createdAt':'2026-10-04T07:00:00.000Z','modifiedAt':None}
      ],
      'deletedWeights':[],'weightUnit':'kg','targetWeightKg':75,'gamificationEnabled':True,
      'notificationPreferences':{'enabled':False,'targetReached':True,'backupDue':True,'longFastSafety':True,'weighIn':False,'weighInCadence':'weekly','cycleComplete':False},
      'language':'en','appearance':'system','iconChoice':'plate'
    }

def main():
    data=seed_data()
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True)
        errors=[]; dialogs=[]; downloads=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.on('dialog',lambda d:(dialogs.append(d.message),d.accept()))
        page.on('download',lambda d: downloads.append(d.suggested_filename))
        page.evaluate(STORAGE_SHIM)
        page.evaluate("""data=>{
          __seedFastingDbV2(data,[]);
          localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.10.1',seenAt:new Date().toISOString()}));
          localStorage.setItem('fastingTracker.backupMeta',JSON.stringify({firstSeenAt:'2026-10-01T00:00:00.000Z',firstDataAt:'2026-10-01T00:00:00.000Z',lastExternalBackupAt:'2026-10-05T10:00:00.000Z',lastExternalBackupRevision:10,lastExternalBackupDataUpdatedAt:'2026-10-05T10:00:00.000Z',snapshotProtectionStatus:'ok',snapshotProtectionAt:null,snapshotStoredCount:0,snapshotDesiredCount:0}));
        }""",data)
        page.set_content(inlined_html(),wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.10.1'",timeout=20000)

        # Main navigation is a real keyboard-navigable tablist.
        tabs=page.locator('.tabs')
        assert tabs.get_attribute('role')=='tablist'
        fasting=page.locator('.tab[data-screen="fasting"]'); fasting.focus(); fasting.press('ArrowRight')
        page.wait_for_function("document.querySelector('.tab[data-screen=\"history\"]')?.getAttribute('aria-selected')==='true'")
        assert page.locator('#history').get_attribute('class').find('active')>=0

        # Filters are collapsed by default, then reduce the visible history without touching stored data.
        page.locator('#historyTools summary').click()
        page.locator('#historyFilterMin').fill('18')
        page.locator('#historyFilterMin').dispatch_event('change')
        page.wait_for_timeout(100)
        assert page.locator('#historyList .historyRow').count()==2
        assert '2' in page.locator('#historyFilterStatus').inner_text()
        page.locator('#historyClearFiltersBtn').click(); page.wait_for_timeout(100)
        assert page.locator('#historyList .historyRow').count()==3

        # Bulk mode is optional and exposes selection/actions only on demand.
        page.locator('#historyBulkModeBtn').click()
        assert page.locator('#historyBulkBar').is_visible()
        page.locator('#historyList input[type="checkbox"]').first.check()
        assert not page.locator('#historyBulkDeleteBtn').is_disabled()
        page.locator('#historyBulkModeBtn').click()

        # Single delete has immediate Undo and returns the same record.
        first_id=page.locator('#historyList .historyRow').first.inner_text()
        page.locator('#historyList .historyRow').first.locator('.dangerText').click()
        page.wait_for_function("!document.querySelector('#undoToast').hidden")
        assert page.locator('#historyList .historyRow').count()==2
        page.locator('#undoToastBtn').click(); page.wait_for_timeout(250)
        assert page.locator('#historyList .historyRow').count()==3
        assert first_id.split('\n')[0] in page.locator('#historyList .historyRow').first.inner_text()

        # Backup freshness switches from current to changed after the audited delete/undo sequence.
        page.locator('.tab[data-screen="settings"]').click(); page.wait_for_timeout(100)
        freshness=page.locator('#backupFreshnessLabel').inner_text().lower()
        assert ('changed' in freshness or 'recommended' in freshness), freshness

        # Manual snapshot accepts a label and the preview exposes a current-vs-snapshot comparison.
        before=int(page.locator('#healthSnapshotCount').inner_text().replace(',','') or '0')
        page.locator('#createSnapshotBtn').click()
        page.locator('#manualSnapshotLabel').fill('Quality checkpoint')
        page.locator('#manualSnapshotSaveBtn').click()
        page.wait_for_function("n=>Number((document.querySelector('#healthSnapshotCount')?.textContent||'0').replace(/,/g,''))>=n+1",arg=before,timeout=10000)
        page.locator('.tab[data-screen="history"]').click(); page.wait_for_timeout(100)
        page.locator('#historyList .historyRow').first.locator('.dangerText').click(); page.wait_for_timeout(150)
        page.locator('.tab[data-screen="settings"]').click(); page.locator('#restoreSnapshotBtn').click()
        snap=page.locator('.snapshotItem').filter(has_text='Quality checkpoint')
        assert snap.count()==1
        snap.locator('button').click()
        page.wait_for_function("!document.querySelector('#snapshotPreviewModal').hidden")
        assert 'Quality checkpoint' in page.locator('#snapshotPreviewLabel').inner_text()
        assert page.locator('#snapshotPreviewComparison').inner_text().strip()
        page.locator('#snapshotPreviewCancelBtn').click(); page.locator('#snapshotCloseBtn').click()

        # Local-only benchmark populates diagnostics; install/cache state always has a readable status.
        page.locator('#performanceTestBtn').click()
        page.wait_for_function("document.querySelector('#healthPerformance')?.textContent && !/not run|не е|no benchmark/i.test(document.querySelector('#healthPerformance').textContent)",timeout=10000)
        assert page.locator('#healthInstallState').inner_text().strip()
        assert page.locator('#healthServiceWorker').inner_text().strip()

        # Export everything starts the three local exports (headless Chromium uses downloads, not Web Share).
        page.locator('#exportEverythingBtn').click(); page.wait_for_timeout(600)
        assert any(name.endswith('.json') for name in downloads), downloads
        assert sum(name.endswith('.csv') for name in downloads)>=2, downloads

        # Accessibility protections are structurally present.
        html=inlined_html()
        assert 'prefers-reduced-motion: reduce' in html and 'min-height:44px' in html
        assert not errors, errors[:5]
        browser.close()
    print('PASS: v1.10.1 quality/history/recovery/diagnostic/accessibility checks')

if __name__=='__main__': main()
