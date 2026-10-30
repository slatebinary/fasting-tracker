#!/usr/bin/env python3
"""Regression: Daily preserves raw points; aggregate modes bucket by period and all scroll newest-first."""
import sys, datetime, json
from pathlib import Path
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

release_version=json.loads((Path(__file__).resolve().parents[1]/'version.json').read_text())['version']
now=datetime.datetime.now(datetime.timezone.utc)
base_ms=int((now+datetime.timedelta(hours=16)).timestamp()*1000)
data=build_data(800, base=base_ms)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844}); errors=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate(f"data => {{ __seedFastingDbV2(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({{lastAppVersion:'{release_version}',seenAt:new Date().toISOString()}})); }}", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("version => document.querySelector('#appVersionLabel')?.textContent === 'v' + version",arg=release_version,timeout=20000)
    page.locator('.tab[data-screen="weight"]').click(); page.wait_for_timeout(150)

    counts={}
    for mode in ('daily','week','month','quarter','halfyear','year'):
        page.locator(f'[data-weight-period="{mode}"]').click()
        page.wait_for_function(f"document.querySelector('#weightChartScroller')?.dataset.period === '{mode}'",timeout=5000)
        page.wait_for_timeout(100)
        info=page.locator('#weightChartScroller').evaluate("e=>({b:+e.dataset.bucketCount,d:+e.dataset.dataPointCount,left:e.scrollLeft,max:e.scrollWidth-e.clientWidth})")
        counts[mode]=info['d']
        if info['d'] < 2:
            print('FAIL: mode did not produce multiple points despite enough data',mode,info); sys.exit(1)
        if mode == 'daily' and info['d'] != 800:
            print('FAIL: Daily must preserve every individual measurement',info); sys.exit(1)
        if info['max'] > 1 and abs(info['left']-info['max']) > 2:
            print('FAIL: chart did not open on newest/right side',mode,info); sys.exit(1)

    if not (counts['daily'] > counts['week'] > counts['month'] > counts['quarter'] > counts['halfyear'] > counts['year']):
        print('FAIL: aggregate granularity counts are unexpected',counts); sys.exit(1)

    # Manual historical scrolling must remain where the user leaves it rather
    # than snapping back to newest on each redraw.
    page.locator('[data-weight-period="month"]').click(); page.wait_for_timeout(100)
    page.locator('#weightChartScroller').evaluate("e=>{e.scrollLeft=0}"); page.wait_for_timeout(150)
    left=page.locator('#weightChartScroller').evaluate("e=>e.scrollLeft")
    if left > 2:
        print('FAIL: chart could not be manually scrolled to older periods',left); sys.exit(1)
    # A normal redraw (unit toggle) must not destroy the manual scroll position.
    page.locator('#unitLbBtn').click(); page.wait_for_timeout(150)
    left_after=page.locator('#weightChartScroller').evaluate("e=>e.scrollLeft")
    if left_after > 2:
        print('FAIL: ordinary redraw snapped chart back to newest',left_after); sys.exit(1)

    # Daily chart values can be browsed point-by-point with the keyboard.
    page.locator('[data-weight-period="daily"]').click(); page.wait_for_timeout(120)
    chart=page.locator('#weightChart'); chart.focus(); page.keyboard.press('ArrowRight'); page.wait_for_timeout(80)
    latest_detail=page.locator('#weightChartDetail').inner_text()
    if not latest_detail.strip():
        print('FAIL: keyboard navigation did not reveal a selected Daily weight value'); sys.exit(1)
    page.keyboard.press('ArrowLeft'); page.wait_for_timeout(80)
    previous_detail=page.locator('#weightChartDetail').inner_text()
    if not previous_detail.strip() or previous_detail == latest_detail:
        print('FAIL: left/right keyboard navigation did not move between Daily weight values',latest_detail,previous_detail); sys.exit(1)

    # The range navigator and Older/Newer buttons must move the selected pointer,
    # not merely page the viewport. Manual scrolling remains available independently.
    page.locator('[data-weight-period="daily"]').click(); page.wait_for_timeout(120)
    slider = page.locator('#weightChartRange')
    if not slider.is_visible() or int(slider.get_attribute('max') or '0') < 799:
        print('FAIL: Daily range navigator does not cover the full history', slider.get_attribute('max')); sys.exit(1)
    slider.evaluate("(e)=>{e.value=e.max;e.dispatchEvent(new Event('input',{bubbles:true}))}")
    page.wait_for_timeout(120)
    latest_detail = page.locator('#weightChartDetail').inner_text()
    latest_left = page.locator('#weightChartScroller').evaluate("e=>e.scrollLeft")
    if not latest_detail.strip() or page.locator('#weightChartNewerBtn').is_enabled():
        print('FAIL: newest measurement was not selected or Newer was not disabled', latest_detail); sys.exit(1)
    page.locator('#weightChartOlderBtn').click(); page.wait_for_timeout(120)
    older_detail = page.locator('#weightChartDetail').inner_text()
    older_left = page.locator('#weightChartScroller').evaluate("e=>e.scrollLeft")
    if older_detail == latest_detail:
        print('FAIL: Older did not move the selected pointer to the previous measurement', latest_detail, older_detail); sys.exit(1)
    page.locator('#weightChartNewerBtn').click(); page.wait_for_timeout(120)
    newer_detail = page.locator('#weightChartDetail').inner_text()
    newer_left = page.locator('#weightChartScroller').evaluate("e=>e.scrollLeft")
    if newer_detail != latest_detail:
        print('FAIL: Newer did not return the selected pointer to the next recent measurement', latest_detail, newer_detail); sys.exit(1)
    slider.evaluate("(e)=>{e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}))}")
    page.wait_for_timeout(100)
    if page.locator('#weightChartOlderBtn').is_enabled():
        print('FAIL: Older must be disabled at the oldest measurement'); sys.exit(1)
    page.locator('#weightChartRange').evaluate("(e)=>{e.value='100';e.dispatchEvent(new Event('input',{bubbles:true}))}")
    page.wait_for_timeout(120)
    selected_detail = page.locator('#weightChartDetail').inner_text()
    range_left = page.locator('#weightChartScroller').evaluate("e=>e.scrollLeft")
    if not selected_detail.strip() or not latest_detail.strip() or range_left >= latest_left:
        print('FAIL: range navigator did not select and reveal older measurements', latest_left, range_left, selected_detail); sys.exit(1)

    # Force a fresh period open so the first Daily pass verifies automatic newest selection.
    page.locator('[data-weight-period="month"]').click(); page.wait_for_timeout(80)
    # Older/Newer must traverse every valid bucket from the newest endpoint
    # to the oldest endpoint and back, for every chart period.
    for mode in ('daily','week','month','quarter','halfyear','year'):
        page.locator(f'[data-weight-period="{mode}"]').click()
        page.wait_for_function(f"document.querySelector('#weightChartScroller')?.dataset.period === '{mode}'",timeout=5000)
        page.wait_for_timeout(100)
        nav = page.locator('#weightChartRange')
        if not nav.is_visible() or int(nav.get_attribute('max') or '0') < 1:
            print('FAIL: range navigator is missing historical buckets for', mode); sys.exit(1)
        info = page.locator('#weightChartScroller').evaluate("e=>({valid:+e.dataset.dataPointCount,buckets:+e.dataset.bucketCount})")
        if info['valid'] < 2:
            print('FAIL: not enough valid buckets for endpoint traversal', mode, info); sys.exit(1)
        latest_index = int(nav.input_value())
        if latest_index != int(nav.get_attribute('max') or '0'):
            print('FAIL: chart did not select the newest bucket on period open', mode, latest_index, nav.get_attribute('max')); sys.exit(1)
        if page.locator('#weightChartNewerBtn').is_enabled():
            print('FAIL: Newer should be disabled at the newest endpoint on period open', mode, latest_index); sys.exit(1)
        previous_index = latest_index
        for step in range(info['valid'] - 1):
            page.locator('#weightChartOlderBtn').click()
            page.wait_for_timeout(10)
            current_index = int(nav.input_value())
            if current_index >= previous_index:
                print('FAIL: Older did not advance toward oldest endpoint', mode, step, previous_index, current_index); sys.exit(1)
            previous_index = current_index
        if page.locator('#weightChartOlderBtn').is_enabled():
            print('FAIL: Older remained enabled at the oldest endpoint', mode, previous_index); sys.exit(1)
        previous_index = int(nav.input_value())
        for step in range(info['valid'] - 1):
            page.locator('#weightChartNewerBtn').click()
            page.wait_for_timeout(10)
            current_index = int(nav.input_value())
            if current_index <= previous_index:
                print('FAIL: Newer did not advance toward newest endpoint', mode, step, previous_index, current_index); sys.exit(1)
            previous_index = current_index
        if page.locator('#weightChartNewerBtn').is_enabled():
            print('FAIL: Newer remained enabled at the newest endpoint', mode, previous_index); sys.exit(1)

    # Raw measurements are still present in the editable history list rather
    # than being replaced by aggregates.
    if page.locator('#weightHistoryList .historyRow').count() < 1 or page.locator('#weightHistoryList .loadMoreWrap').count() != 1:
        print('FAIL: individual weight history is not retained'); sys.exit(1)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: Daily raw points, calendar aggregation, newest-first loading, historical scrolling and raw-entry retention')
