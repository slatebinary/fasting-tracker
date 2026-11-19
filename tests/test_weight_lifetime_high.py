#!/usr/bin/env python3
"""Regression: lifetime highest weight is independent of the selected chart period."""
import sys
import datetime
from pathlib import Path
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}')
    sys.exit(0)

ROOT = Path(__file__).resolve().parents[1]
version = __import__('json').loads((ROOT / 'version.json').read_text())['version']

# Anchor the fixture to the current date. Keep the oldest measurement within
# the app's supported one-year history, but outside the latest 30-day window.
# This makes the test deterministic without relying on a stale fixed date.
desired_latest = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=1)
base_ms = int((desired_latest + datetime.timedelta(hours=16)).timestamp() * 1000)
data = build_data(300, base=base_ms)

# The oldest active measurement is the lifetime maximum and is outside the
# most recent 30-day window. A larger soft-deleted record must not be counted.
data['weights'][0]['kg'] = 120.0
data['deletedWeights'] = [{
    'id': 'deleted-peak', 'when': data['weights'][0]['when'], 'kg': 150.0,
    'timeZone': 'UTC', 'deletedAt': '2026-01-02T00:00:00.000Z'
}]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                args=['--no-sandbox', '--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("arg => { __seedFastingDbV2(arg.data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:arg.version,seenAt:new Date().toISOString()})); }",
                  {'data': data, 'version': version})
    page.set_content(inlined_html(), wait_until='domcontentloaded')
    page.wait_for_function("v => document.querySelector('#appVersionLabel')?.textContent === 'v' + v",
                           arg=version, timeout=20000)
    page.locator('.tab[data-screen="weight"]').click()
    page.wait_for_function("document.querySelector('#weight.screen')?.classList.contains('active')", timeout=5000)
    # Wait for the asynchronous IndexedDB-backed data render, not merely the
    # tab's active CSS state. Without this, the assertion can race startup.
    page.wait_for_function("""() => {
        const range = document.querySelector('#weightPeriodRange');
        return range?.dataset.period === 'daily' && Number(range.dataset.count) > 0
          && document.querySelector('#wPeriodHigh')?.textContent.trim() !== '—';
    }""", timeout=10000)

    lifetime = page.locator('#wAllTimeHigh').inner_text().strip()
    if '120' not in lifetime:
        raise AssertionError(f'Expected all-time high of 120 kg, got {lifetime!r}')
    period_high = page.locator('#wPeriodHigh').inner_text().strip()
    if '120' in period_high:
        raise AssertionError('Period highest incorrectly includes the older lifetime-only measurement')

    # Change period and navigate through the chart. Lifetime maximum must not move.
    for mode in ('week', 'month', 'quarter', 'halfyear', 'year', 'daily'):
        page.locator(f'[data-weight-period="{mode}"]').click()
        page.wait_for_function("m => document.querySelector('#weightChartScroller')?.dataset.period === m",
                               arg=mode, timeout=5000)
        if page.locator('#wAllTimeHigh').inner_text().strip() != lifetime:
            raise AssertionError(f'Lifetime maximum changed after selecting {mode}')

    slider = page.locator('#weightChartRange')
    if slider.is_visible() and int(slider.get_attribute('max') or '0') > 0:
        for value in ('0', slider.get_attribute('max')):
            slider.evaluate('(e,v) => { e.value=v; e.dispatchEvent(new Event("input", {bubbles:true})); }', value)
            if page.locator('#wAllTimeHigh').inner_text().strip() != lifetime:
                raise AssertionError(f'Lifetime maximum changed at chart index {value}')

    # Deleted measurements are excluded, even when they exceed the active maximum.
    if '150' in page.locator('#wAllTimeHigh').inner_text():
        raise AssertionError('Soft-deleted weight was included in all-time maximum')
    if errors:
        raise AssertionError('Browser errors: ' + ' | '.join(errors[:3]))
    browser.close()
print('PASS: all-time maximum is stable across periods and chart navigation; deleted weights excluded')
