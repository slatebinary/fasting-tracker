#!/usr/bin/env python3
"""Regression: selectable weight periods show range-specific metrics and chart data."""
import sys, time, datetime
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM, iso
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

# Build 400 daily records ending today, at a safely past UTC hour, so every
# selectable period has deterministic data while the Year view excludes some.
now=datetime.datetime.now(datetime.timezone.utc)
desired_latest=now-datetime.timedelta(hours=1)
# build_data places the newest weigh-in at base - 16 hours.
base_ms=int((desired_latest + datetime.timedelta(hours=16)).timestamp()*1000)
data=build_data(400, base=base_ms)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.10.1',seenAt:new Date().toISOString()})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.10.1'",timeout=20000)
    page.locator('.tab[data-screen="weight"]').click()
    page.wait_for_function("document.querySelector('#weight')?.classList.contains('active')",timeout=5000)
    page.wait_for_function("document.querySelector('#weightPeriodRange')?.dataset.period === 'daily'",timeout=5000)

    def period(mode):
        page.locator(f'[data-weight-period="{mode}"]').click()
        page.wait_for_function(f"document.querySelector('#weightPeriodRange')?.dataset.period === '{mode}'",timeout=5000)
        return int(page.locator('#weightPeriodRange').get_attribute('data-count'))

    # Daily is the default and summarizes the most recent 30 calendar days.
    # The longer rolling windows remain available and grow monotonically.
    daily_count=int(page.locator('#weightPeriodRange').get_attribute('data-count'))
    week_count=period('week')
    month_count=period('month')
    quarter_count=period('quarter')
    half_count=period('halfyear')
    year_count=period('year')
    if not (1 <= week_count < month_count < quarter_count < half_count < year_count <= 367):
        print('FAIL: unexpected weight period counts', week_count, month_count, quarter_count, half_count, year_count); sys.exit(1)
    if not (28 <= daily_count <= 31):
        print('FAIL: Daily rolling statistics should cover about 30 days', daily_count); sys.exit(1)

    # Summary metrics must be populated for a period with data.
    for selector in ['#wPeriodStart','#wPeriodEnd','#wPeriodChange','#wPeriodAverage','#wPeriodLow','#wPeriodHigh']:
        text=page.locator(selector).inner_text().strip()
        if not text or text == '—':
            print('FAIL: empty period metric', selector); sys.exit(1)

    # The selected tab state and exact date-range summary are visible.
    if page.locator('[data-weight-period="year"]').get_attribute('aria-selected') != 'true':
        print('FAIL: Year period is not selected'); sys.exit(1)
    summary=page.locator('#weightPeriodRange').inner_text()
    if 'measurement' not in summary:
        print('FAIL: period range/count summary is missing'); sys.exit(1)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: daily plus weekly/monthly/quarterly/6-month/yearly weight statistics')
