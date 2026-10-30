#!/usr/bin/env python3
"""v1.17.8 chronological Statistics history navigation regression."""
import sys
from browser_perf_common import STORAGE_SHIM, inlined_html, build_data
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

VERSION='1.17.8'
data=build_data(240)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("d=>{__seedFastingDbV2(d,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.17.8'}));}",data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent==='v{VERSION}'",timeout=20000)
    page.locator('.tab[data-screen="stats"]').click();page.wait_for_timeout(300)

    nav=page.locator('#statsHistoryNavigator')
    if nav.is_hidden():
        print('FAIL: Timeline history navigator is not visible');sys.exit(1)
    slider=page.locator('#statsHistoryRange')
    if int(slider.get_attribute('max') or 0)<100:
        print('FAIL: Timeline navigator does not span the complete history');sys.exit(1)

    def assert_boundaries(view, range_name=None, minimum=1):
        page.locator('#statsVizSelect').select_option(view);page.wait_for_timeout(120)
        if range_name:
            page.locator('#statsRangeSelect').select_option(range_name);page.wait_for_timeout(140)
        if nav.is_hidden():
            raise AssertionError(f'{view}: chronological navigator hidden')
        max_index=int(slider.get_attribute('max') or 0)
        if max_index<minimum:
            raise AssertionError(f'{view}: expected at least {minimum+1} navigation positions, got {max_index+1}')
        slider.fill('0');page.wait_for_timeout(50)
        if not page.locator('#statsHistoryOlderBtn').is_disabled() or page.locator('#statsHistoryNewerBtn').is_disabled():
            raise AssertionError(f'{view}: oldest boundary buttons are incorrect')
        page.locator('#statsHistoryNewerBtn').click();page.wait_for_timeout(40)
        if slider.input_value()!='1':
            raise AssertionError(f'{view}: Newer did not advance exactly one data point')
        page.locator('#statsHistoryOlderBtn').click();page.wait_for_timeout(40)
        if slider.input_value()!='0':
            raise AssertionError(f'{view}: Older did not return exactly one data point')
        slider.fill(str(max_index));page.wait_for_timeout(50)
        if page.locator('#statsHistoryOlderBtn').is_disabled() or not page.locator('#statsHistoryNewerBtn').is_disabled():
            raise AssertionError(f'{view}: newest boundary buttons are incorrect')
        page.locator('#statsHistoryOlderBtn').click();page.wait_for_timeout(40)
        if int(slider.input_value())!=max_index-1:
            raise AssertionError(f'{view}: Older did not move from newest to previous data point')

    assert_boundaries('timeline',minimum=100)
    assert_boundaries('trend','all',minimum=100)
    assert_boundaries('weeks',minimum=7)
    assert_boundaries('months','all',minimum=2)
    assert_boundaries('success','all',minimum=2)
    assert_boundaries('cumulative','all',minimum=100)

    # Calendar keeps its dedicated month controls; category charts do not get chronological controls.
    page.locator('#statsVizSelect').select_option('calendar');page.wait_for_timeout(100)
    if not nav.is_hidden() or page.locator('#calendarPrevBtn').is_hidden() or page.locator('#calendarNextBtn').is_hidden():
        print('FAIL: Calendar month navigation was not preserved independently');sys.exit(1)
    for view in ('distribution','startpattern'):
        page.locator('#statsVizSelect').select_option(view);page.wait_for_timeout(100)
        if not nav.is_hidden():
            print(f'FAIL: category-based {view} view incorrectly shows chronological navigation');sys.exit(1)

    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:5]));sys.exit(1)
    browser.close()
print('PASS: v1.17.8 Statistics history navigation across chronological views, exact stepping, boundaries, and Calendar/category exclusions')
