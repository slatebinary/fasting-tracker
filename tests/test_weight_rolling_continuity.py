#!/usr/bin/env python3
"""Regression: Rolling weight series continues through today, then expires with its real trailing window."""
import sys, json, datetime
from pathlib import Path
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}"); sys.exit(0)

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/"version.json").read_text(encoding="utf-8"))["version"]
PERIODS={"week":7,"month":30,"quarter":90,"halfyear":180,"year":365}
now=datetime.datetime.now(datetime.timezone.utc)

def data_with_latest_measurement(latest, count):
    base=int((latest+datetime.timedelta(hours=16)).timestamp()*1000)
    return build_data(count,base=base)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path="/usr/bin/chromium",headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])

    def open_weight_page(data):
        page=browser.new_page(viewport={"width":390,"height":844},timezone_id="UTC")
        page.evaluate(STORAGE_SHIM)
        page.evaluate(
            """(args) => {
              __seedFastingDbV2(args.data, []);
              localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion: args.version}));
            }""",
            {"data":data,"version":VERSION},
        )
        page.set_content(inlined_html(),wait_until="domcontentloaded")
        page.wait_for_function("version => document.querySelector('#appVersionLabel')?.textContent === 'v' + version",arg=VERSION,timeout=20000)
        page.locator('.tab[data-screen="weight"]').click()
        page.wait_for_function("document.querySelector('#weight')?.classList.contains('active')",timeout=5000)
        return page

    # Three real daily measurements ending yesterday must produce a rolling
    # point for every calendar day through today, for every rolling period.
    latest=now-datetime.timedelta(days=1)
    active_data=data_with_latest_measurement(latest,3)
    first_day=(latest-datetime.timedelta(days=2)).date()
    today=now.date()
    expected_points=(today-first_day).days+1
    if expected_points < 4:
        raise AssertionError(f"Fixture does not span the expected local-day tail: {expected_points}")
    page=open_weight_page(active_data)
    for mode,window_days in PERIODS.items():
        page.locator(f'[data-weight-period="{mode}"]').click()
        page.wait_for_function(f"document.querySelector('#weightChartScroller')?.dataset.period === '{mode}'",timeout=5000)
        info=page.locator("#weightChartScroller").evaluate(
            "e=>({points:+e.dataset.dataPointCount,buckets:+e.dataset.bucketCount,selected:+e.dataset.selectedWindowCount})"
        )
        if info["points"] != expected_points or info["buckets"] != expected_points:
            raise AssertionError(f"{mode}: rolling series did not continue through today: {info}, expected {expected_points}")
        if info["selected"] != 3:
            raise AssertionError(f"{mode}: trailing average must contain only the three real measurements: {info}")
        if int(page.locator("#weightChartRange").get_attribute("max") or "0") != expected_points-1:
            raise AssertionError(f"{mode}: navigator does not include the current-day rolling point")
    page.close()

    # When the only real measurement ages out of a trailing window, the
    # series must stop at the last day on which that measurement is eligible.
    for mode,window_days in PERIODS.items():
        old_latest=now-datetime.timedelta(days=window_days+2)
        expired_page=open_weight_page(data_with_latest_measurement(old_latest,1))
        expired_page.locator(f'[data-weight-period="{mode}"]').click()
        expired_page.wait_for_function(f"document.querySelector('#weightChartScroller')?.dataset.period === '{mode}'",timeout=5000)
        info=expired_page.locator("#weightChartScroller").evaluate(
            "e=>({points:+e.dataset.dataPointCount,buckets:+e.dataset.bucketCount})"
        )
        if info["points"] != window_days or info["buckets"] != window_days:
            raise AssertionError(f"{mode}: rolling series must stop when its real measurement expires: {info}, expected {window_days}")
        if int(expired_page.locator("#weightChartRange").get_attribute("max") or "0") != window_days-1:
            raise AssertionError(f"{mode}: navigator includes days beyond the trailing-window expiry")
        expired_page.close()

    browser.close()
print("PASS: rolling series continues through today while supported by real measurements and stops at trailing-window expiry")
