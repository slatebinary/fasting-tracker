#!/usr/bin/env python3
"""v1.12.1: Settings uses progressive disclosure and searchable sections."""
from playwright.sync_api import sync_playwright
from browser_perf_common import inlined_html, STORAGE_SHIM

VERSION='1.12.1'

def seed_data():
    return {'dataVersion':1,'revision':1,'updatedAt':'2026-10-06T18:00:00.000Z','goalHours':16,
      'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,'activeCreatedAt':None,'activeModifiedAt':None,
      'records':[],'deletedFasts':[],'weights':[],'deletedWeights':[],'weightUnit':'kg','targetWeightKg':None,
      'gamificationEnabled':True,'notificationPreferences':{'enabled':False,'targetReached':True,'backupDue':True,'longFastSafety':True,'weighIn':False,'weighInCadence':'weekly','cycleComplete':False},
      'language':'en','appearance':'system','iconChoice':'plate'}

def main():
  with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda e: errors.append(str(e)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("d=>{__seedFastingDbV2(d,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.12.1'}));}",seed_data())
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.12.1'",timeout=20000)
    page.locator('.tab[data-screen="settings"]').click()
    page.wait_for_timeout(100)
    groups=page.locator('#settings .settingsGroup')
    assert groups.count()==7, groups.count()
    assert page.locator('#settingsGroupGeneral').get_attribute('open') is not None
    for gid in ['settingsGroupNotifications','settingsGroupData','settingsGroupUpdates','settingsGroupAccessibility','settingsGroupAdvanced','settingsGroupHelp']:
      assert page.locator('#'+gid).get_attribute('open') is None, gid
    # The initial screen is compact: advanced tools and help exist but are collapsed.
    assert page.locator('#performanceTestBtn').count()==1
    assert not page.locator('#performanceTestBtn').is_visible()
    assert page.locator('#settingsSearchInput').is_visible()
    # Searching finds and opens only the relevant section.
    page.locator('#settingsSearchInput').fill('benchmark')
    page.wait_for_timeout(50)
    assert page.locator('#settingsGroupAdvanced').is_visible()
    assert page.locator('#settingsGroupAdvanced').get_attribute('open') is not None
    assert page.locator('#performanceTestBtn').is_visible()
    assert not page.locator('#settingsGroupGeneral').is_visible()
    assert '1' in page.locator('#settingsSearchStatus').inner_text()
    # Clear restores section visibility/default disclosure.
    page.locator('#settingsSearchClearBtn').click()
    page.wait_for_timeout(50)
    assert page.locator('#settingsGroupGeneral').is_visible()
    assert page.locator('#settingsGroupGeneral').get_attribute('open') is not None
    assert page.locator('#settingsGroupAdvanced').get_attribute('open') is None
    # Updates are a first-class section and deployment details remain nested.
    page.locator('#settingsGroupUpdates > summary').click()
    assert page.locator('#updateBtn').is_visible()
    assert not page.locator('#healthDeploymentVersions').is_visible()
    page.locator('#settingsUpdateAdvanced > summary').click()
    assert page.locator('#healthDeploymentVersions').is_visible()
    # VoiceOver/accessibility support is retained but not cluttering the initial screen.
    page.locator('#settingsGroupAccessibility > summary').click()
    assert 'VoiceOver' in page.locator('#accessibilitySettingsCard').inner_text()
    assert not errors, errors[:5]
    browser.close()
  print('PASS: v1.12.1 Settings is compact, searchable, progressively disclosed, and keeps accessibility/update diagnostics available')

if __name__=='__main__': main()
