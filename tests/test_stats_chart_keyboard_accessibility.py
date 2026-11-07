#!/usr/bin/env python3
"""Keyboard and screen-reader affordances for statistics charts."""
import sys
from browser_perf_common import CURRENT_VERSION, build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}")
    sys.exit(0)

data = build_data(45)
for i, record in enumerate(data["records"]):
    from datetime import datetime, timedelta
    start = datetime.fromisoformat(record["start"].replace("Z", "+00:00"))
    record["end"] = (start + timedelta(hours=8 + (i % 12))).isoformat().replace("+00:00", "Z")

chart_ids = [
    "chart", "fastTrendChart", "fastWeeksChart", "fastMonthsChart",
    "fastDistributionChart", "fastSuccessChart", "fastStartPatternChart",
    "fastCumulativeChart",
]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True,
                                args=["--no-sandbox", "--disable-dev-shm-usage"])
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
    page.locator('.tab[data-screen="stats"]').click()

    for chart_id in chart_ids:
        canvas = page.locator("#" + chart_id)
        if canvas.get_attribute("role") != "img" or canvas.get_attribute("tabindex") != "0":
            raise AssertionError(f"{chart_id}: canvas must be a focusable image")
        label = canvas.get_attribute("aria-label")
        if not label or label.strip() == "":
            raise AssertionError(f"{chart_id}: accessible name missing")

    toggle = page.locator("#statsChartDataBtn")
    toggle.focus()
    page.keyboard.press("Enter")
    page.wait_for_function("""() => {
      const b=document.querySelector('#statsChartDataBtn');
      const d=document.querySelector('#statsChartData');
      return b?.getAttribute('aria-expanded')==='true' && d && !d.hidden;
    }""")
    page.wait_for_function("document.querySelectorAll('#statsChartData li').length >= 2")
    rows = page.locator("#statsChartData li").all_inner_texts()
    if len(rows) < 2:
        raise AssertionError("Keyboard disclosure should expose chart data rows")

    # Each chart mode should have a text alternative through the same disclosure.
    for mode in ["trend", "weeks", "months", "distribution", "success", "startPattern", "cumulative"]:
        page.locator("#statsVizSelect").select_option(mode)
        page.wait_for_timeout(80)
        page.locator("#statsChartDataBtn").focus()
        page.keyboard.press("Enter")  # close
        page.keyboard.press("Enter")  # reopen after mode update
        page.wait_for_function("!document.querySelector('#statsChartData').hidden")
        page.wait_for_timeout(80)
        if page.locator("#statsChartData li").count() < 1:
            raise AssertionError(f"{mode}: no accessible chart data rows")

    if page.locator("#statsChartDataBtn").get_attribute("aria-expanded") != "true":
        raise AssertionError("Disclosure state must stay synchronized with expanded content")
    if errors:
        raise AssertionError("Browser errors: " + " | ".join(errors[:3]))
    browser.close()
print("PASS: statistics canvases have accessible names and keyboard focus; chart-data disclosure toggles via Enter and provides text rows for every chart mode")
