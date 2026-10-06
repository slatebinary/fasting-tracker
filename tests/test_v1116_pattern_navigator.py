#!/usr/bin/env python3
"""v1.11.7: compact grouped Fasting Patterns navigator regression."""
import sys
from browser_perf_common import STORAGE_SHIM, inlined_html, build_data
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

VERSION='1.11.7'
data=build_data(120)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("d=>{__seedFastingDbV2(d,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.11.7'}));}",data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent==='v{VERSION}'",timeout=20000)
    page.locator('.tab[data-screen="stats"]').click();page.wait_for_timeout(200)

    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3]));sys.exit(1)
    if page.locator('#statsVizGroupSwitcher [data-viz-group]').count()!=4:
        print('FAIL: expected four top-level visualization groups');sys.exit(1)
    if page.locator('#statsVizSelect option').count()!=9:
        print('FAIL: expected all nine chart views in the grouped View selector');sys.exit(1)
    if page.locator('#statsVizSelect optgroup').count()!=4:
        print('FAIL: View selector should expose four grouped categories');sys.exit(1)
    group_h=page.locator('#statsVizGroupSwitcher').bounding_box()['height']
    if group_h>110:
        print(f'FAIL: mobile category navigator too tall: {group_h}px');sys.exit(1)

    # Group activation chooses that group's remembered/default chart.
    page.locator('#statsVizGroupSwitcher [data-viz-group="timing"]').click();page.wait_for_timeout(80)
    if page.locator('#statsVizSelect').input_value()!='startpattern' or not page.locator('#statsVizGroupSwitcher [data-viz-group="timing"]').evaluate('el=>el.classList.contains("active")'):
        print('FAIL: Timing group did not activate its default/remembered chart');sys.exit(1)
    page.locator('#statsVizSelect').select_option('distribution');page.wait_for_timeout(80)
    if page.locator('#statsDistributionView').is_hidden():
        print('FAIL: Durations view did not activate through compact selector');sys.exit(1)

    # Selecting a view from another optgroup moves the primary group automatically.
    page.locator('#statsVizSelect').select_option('cumulative');page.wait_for_timeout(80)
    if not page.locator('#statsVizGroupSwitcher [data-viz-group="longterm"]').evaluate('el=>el.classList.contains("active")') or page.locator('#statsCumulativeView').is_hidden():
        print('FAIL: selecting Cumulative did not synchronize the Long-term group');sys.exit(1)

    # Per-group memory: Overview remembers Trend after visiting another group.
    page.locator('#statsVizSelect').select_option('trend');page.wait_for_timeout(60)
    page.locator('#statsVizGroupSwitcher [data-viz-group="timing"]').click();page.wait_for_timeout(60)
    page.locator('#statsVizGroupSwitcher [data-viz-group="overview"]').click();page.wait_for_timeout(80)
    if page.locator('#statsVizSelect').input_value()!='trend' or page.locator('#statsTrendView').is_hidden():
        print('FAIL: per-category last-view memory did not restore Trend');sys.exit(1)

    pref=page.evaluate("()=>JSON.parse(localStorage.getItem('fastingTracker.statsVizSelection')||'null')")
    if not pref or pref.get('activeGroup')!='overview' or pref.get('lastByGroup',{}).get('overview')!='trend' or pref.get('lastByGroup',{}).get('timing')!='distribution':
        print('FAIL: grouped visualization preference was not persisted correctly');sys.exit(1)

    # Keyboard arrows navigate category controls and keep selector synchronized.
    overview=page.locator('#statsVizGroupSwitcher [data-viz-group="overview"]')
    overview.focus();overview.press('ArrowRight');page.wait_for_timeout(80)
    if page.locator('#statsVizSelect').input_value()!='distribution':
        print('FAIL: keyboard category navigation did not restore Timing/Durations');sys.exit(1)

    browser.close()
print('PASS: v1.11.7 compact grouped Fasting Patterns navigator, synchronization and per-category memory')
