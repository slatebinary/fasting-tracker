#!/usr/bin/env python3
"""Pointer-drag regression for the weight-history range navigator."""
import json
from pathlib import Path
from browser_perf_common import STORAGE_SHIM, build_data, inlined_html
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
DATA = build_data(90)

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
    page.evaluate(
        """arg => {
          __seedFastingDbV2(arg.data, []);
          localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:arg.version}));
        }""",
        {"data": DATA, "version": VERSION},
    )
    page.set_content(inlined_html(), wait_until="domcontentloaded")
    page.wait_for_function(
        "v => document.querySelector('#appVersionLabel')?.textContent === 'v' + v",
        arg=VERSION,
        timeout=20000,
    )
    page.locator('.tab[data-screen="weight"]').click()
    page.locator('[data-weight-period="daily"]').click()
    slider = page.locator("#weightChartRange")
    page.wait_for_function("document.querySelector('#weightChartRange')?.max === '89'")
    assert slider.is_visible(), "Weight history range navigator is not visible"
    slider.scroll_into_view_if_needed()
    bounds = slider.bounding_box()
    assert bounds and bounds["width"] >= 140, bounds
    minimum, maximum = 0, int(slider.get_attribute("max"))
    y = bounds["y"] + bounds["height"] / 2
    left = bounds["x"] + 2
    right = bounds["x"] + bounds["width"] - 2

    def drag(start_x, end_x):
        page.mouse.move(start_x, y)
        page.mouse.down()
        page.mouse.move(end_x, y, steps=24)
        page.mouse.up()
        page.wait_for_timeout(100)
        return int(slider.input_value())

    # Newest is the right endpoint on initial chart load.
    assert int(slider.input_value()) == maximum, slider.input_value()
    assert not page.locator("#weightChartNewerBtn").is_enabled()
    moved_old = drag(right, left)
    assert moved_old == minimum, f"Dragging left must reach oldest endpoint; got {moved_old}"
    assert not page.locator("#weightChartOlderBtn").is_enabled(), "Older must disable at oldest endpoint"
    assert page.locator("#weightChartNewerBtn").is_enabled(), "Newer must enable at oldest endpoint"

    moved_new = drag(left, right)
    assert moved_new == maximum, f"Dragging right must reach newest endpoint; got {moved_new}"
    assert not page.locator("#weightChartNewerBtn").is_enabled(), "Newer must disable at newest endpoint"
    assert page.locator("#weightChartOlderBtn").is_enabled(), "Older must enable at newest endpoint"

    # Intermediate dragging must preserve the left-to-right oldest-to-newest mapping.
    midpoint = drag(right, (left + right) / 2)
    assert 30 <= midpoint <= 60, f"Midpoint drag selected an unexpected index: {midpoint}"
    assert page.evaluate("window.getSelection()?.toString() || ''") == "", "Dragging the range selected page text"
    assert not errors, errors[:5]
    browser.close()

print("PASS: weight-history range pointer dragging, direction, intermediate selection, endpoints and no text selection")
