#!/usr/bin/env python3
"""Regression: a seven-day rolling window includes seven consecutive daily weigh-ins and states its exact dates."""
import sys, json, datetime
from pathlib import Path
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}"); sys.exit(0)

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/"version.json").read_text(encoding="utf-8"))["version"]
# This anchor makes the seven stored calendar dates exactly 31 Oct–6 Nov 2026.
base=int(datetime.datetime(2026,11,7,8,tzinfo=datetime.timezone.utc).timestamp()*1000)
data=build_data(7,base=base)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path="/usr/bin/chromium",headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
    page=browser.new_page(viewport={"width":390,"height":844},timezone_id="UTC")
    errors=[]
    page.on("pageerror",lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate(
        """args => {
          __seedFastingDbV2(args.data, []);
          localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:args.version}));
        }""",
        {"data":data,"version":VERSION},
    )
    page.set_content(inlined_html(),wait_until="domcontentloaded")
    page.wait_for_function("version => document.querySelector('#appVersionLabel')?.textContent === 'v' + version",arg=VERSION,timeout=20000)
    page.locator('.tab[data-screen="weight"]').click()
    page.wait_for_function("document.querySelector('#weight.screen')?.classList.contains('active')",timeout=5000)
    page.locator('[data-weight-period="week"]').click()
    page.wait_for_function("document.querySelector('#weightChartScroller')?.dataset.period === 'week'",timeout=5000)
    page.wait_for_function("Number(document.querySelector('#weightChartScroller')?.dataset.dataPointCount) >= 7",timeout=5000)
    # The rolling series begins on 31 Oct; index 6 selects its 6 Nov point.
    page.locator("#weightChartRange").evaluate("""e => {
      e.value='6';
      e.dispatchEvent(new Event('input',{bubbles:true}));
    }""")
    page.wait_for_function("document.querySelector('#weightChartScroller')?.dataset.selectedWindowCount === '7'",timeout=5000)
    info=page.locator("#weightChartScroller").evaluate(
        "e=>({selected:+e.dataset.selectedWindowCount,index:+document.querySelector('#weightChartRange').value})"
    )
    detail=page.locator("#weightChartDetail").inner_text()
    if info["selected"] != 7 or info["index"] != 6:
        raise AssertionError(f"Selected 6 Nov rolling window must contain all seven daily entries: {info}")
    for expected in ("Oct 31, 2026","Nov 6, 2026","7 measurements in this window"):
        if expected not in detail:
            raise AssertionError(f"Rolling detail missing {expected!r}: {detail}")
    if "Ending" in detail:
        raise AssertionError(f"Rolling detail still uses the ending-date-only label: {detail}")
    if errors:
        raise AssertionError("Browser errors: "+" | ".join(errors[:3]))
    browser.close()
print("PASS: 31 Oct–6 Nov 2026 rolling window reports all seven daily measurements and its inclusive date range")
