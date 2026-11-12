#!/usr/bin/env python3
"""Regression: rolling Weight charts continue daily through today after the last weigh-in."""
import sys, json, datetime
from pathlib import Path
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}"); sys.exit(0)

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/"version.json").read_text(encoding="utf-8"))["version"]
now=datetime.datetime.now(datetime.timezone.utc)
latest=now-datetime.timedelta(days=1)
base=int((latest+datetime.timedelta(hours=16)).timestamp()*1000)
data=build_data(3,base=base)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path="/usr/bin/chromium",headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
    page=browser.new_page(viewport={"width":390,"height":844},timezone_id="UTC")
    errors=[]; page.on("pageerror",lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("d=>{__seedFastingDbV2(d,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:VERSION_PLACEHOLDER}));}".replace("VERSION_PLACEHOLDER",VERSION),data)
    page.set_content(inlined_html(),wait_until="domcontentloaded")
    page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent==='v{VERSION}'",timeout=20000)
    page.locator('.tab[data-screen="weight"]').click()
    page.wait_for_function("document.querySelector('#weight')?.classList.contains('active')",timeout=5000)
    for mode in ("week","month","quarter","halfyear","year"):
        page.locator(f'[data-weight-period="{mode}"]').click()
        page.wait_for_function(f"document.querySelector('#weightChartScroller')?.dataset.period==='{mode}'",timeout=5000)
        info=page.locator("#weightChartScroller").evaluate("e=>({points:+e.dataset.dataPointCount,buckets:+e.dataset.bucketCount})")
        if info["points"]<7:
            raise AssertionError(f"{mode}: rolling series did not fill daily tail through today: {info}")
        if info["points"]!=info["buckets"]:
            raise AssertionError(f"{mode}: plotted bucket count differs from data points: {info}")
    if errors: raise AssertionError("Browser errors: "+" | ".join(errors[:5]))
    browser.close()
print("PASS: sparse weigh-ins retain daily rolling points through today's local date across all rolling periods")
