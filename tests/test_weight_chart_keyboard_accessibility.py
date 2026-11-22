#!/usr/bin/env python3
"""Keyboard navigation keeps the Weight chart's text alternative in sync."""
import sys
from browser_perf_common import CURRENT_VERSION, build_data, inlined_html, STORAGE_SHIM

try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}")
    sys.exit(0)

data = build_data(45)
with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/chromium",
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("""d => {
      __seedFastingDbV2(d, []);
      localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.12.2'}));
    }""", data)
    page.set_content(inlined_html(), wait_until="domcontentloaded")
    page.wait_for_function(
        f"document.querySelector('#appVersionLabel')?.textContent === 'v{CURRENT_VERSION}'",
        timeout=20000,
    )
    page.locator('.tab[data-screen="weight"]').click()
    page.wait_for_function(
        "document.querySelector('#weightChartScroller')?.dataset.period === 'daily'",
        timeout=10000,
    )

    chart = page.locator("#weightChart")
    if chart.get_attribute("role") != "img" or chart.get_attribute("tabindex") != "0":
        raise AssertionError("Weight chart must remain a focusable, named image")
    if not chart.get_attribute("aria-label") or not chart.get_attribute("aria-describedby"):
        raise AssertionError("Weight chart must expose an accessible name and instructions")

    disclosure = page.locator("#weightChartDataBtn")
    disclosure.click()
    page.wait_for_function(
        "!document.querySelector('#weightChartData').hidden && document.querySelectorAll('#weightChartData li').length > 0"
    )
    before = page.locator("#weightChartData").inner_text()
    if not before.strip():
        raise AssertionError("Expanded chart-data disclosure must contain text")

    # The initial point is the newest; repeated Left arrows traverse to older data.
    chart.focus()
    for _ in range(50):
        page.keyboard.press("ArrowLeft")
    page.wait_for_function(
        "document.querySelector('#weightChartRange')?.value === '0'",
        timeout=10000,
    )
    page.wait_for_function(
        "() => document.querySelector('#weightChartData')?.innerText && document.querySelector('#weightChartData').innerText !== window.__weightChartDataBefore",
        timeout=10000,
    ) if False else None
    after = page.locator("#weightChartData").inner_text()
    if before == after:
        raise AssertionError("Keyboard navigation changed the selected point but left the expanded text alternative stale")
    if page.locator("#weightChartDetail").get_attribute("role") != "status" or page.locator("#weightChartDetail").get_attribute("aria-live") != "polite":
        raise AssertionError("Selected weight point must be announced through a polite status region")
    if not page.locator("#weightChartDetail").inner_text().strip():
        raise AssertionError("Keyboard-selected point must expose its value and date/period")
    if not page.locator("#weightChartRange").get_attribute("aria-valuetext"):
        raise AssertionError("Weight history slider must announce the selected period and value")

    # Enter on the chart opens the text alternative and moves focus into it.
    disclosure.click()
    chart.focus()
    page.keyboard.press("Enter")
    page.wait_for_function(
        "!document.querySelector('#weightChartData').hidden && document.activeElement === document.querySelector('#weightChartData')"
    )

    if errors:
        raise AssertionError("Browser errors: " + " | ".join(errors[:3]))
    browser.close()

print("PASS: Weight chart keyboard navigation synchronizes the text alternative and announces the selected point")
