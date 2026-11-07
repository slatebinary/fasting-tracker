#!/usr/bin/env python3
"""Touch-swipe regression for chronological weight-chart scrolling."""
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
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        device_scale_factor=1,
        is_mobile=True,
        has_touch=True,
    )
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
    scroller = page.locator("#weightChartScroller")
    scroller.scroll_into_view_if_needed()
    page.wait_for_function(
        "document.querySelector('#weightChartScroller')?.dataset.period === 'daily'"
    )
    bounds = scroller.bounding_box()
    assert bounds and bounds["width"] >= 180, bounds
    initial = scroller.evaluate(
        "e => ({left:e.scrollLeft,max:e.scrollWidth-e.clientWidth,width:e.clientWidth})"
    )
    assert initial["max"] > 100, initial
    assert abs(initial["left"] - initial["max"]) <= 2, (
        "Daily weight chart should open at the newest/right endpoint", initial
    )

    session = page.context.new_cdp_session(page)
    y = bounds["y"] + bounds["height"] / 2
    start_x = bounds["x"] + bounds["width"] / 2

    def touch_swipe(delta_x):
        session.send(
            "Input.dispatchTouchEvent",
            {"type": "touchStart", "touchPoints": [{"x": start_x, "y": y, "id": 1}]},
        )
        for step in range(1, 13):
            x = start_x + delta_x * step / 12
            session.send(
                "Input.dispatchTouchEvent",
                {"type": "touchMove", "touchPoints": [{"x": x, "y": y, "id": 1}]},
            )
        session.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(180)
        return scroller.evaluate("e => e.scrollLeft")

    older_position = touch_swipe(64)
    assert older_position < initial["left"] - 20, (
        "A rightward finger swipe must reveal older/left-side weight history",
        initial["left"], older_position,
    )
    newer_position = touch_swipe(-64)
    assert newer_position > older_position + 20, (
        "A leftward finger swipe must reveal newer/right-side weight history",
        older_position, newer_position,
    )
    assert abs(newer_position - initial["left"]) < 18, (
        "Opposite swipes should return close to the original newest position",
        initial["left"], newer_position,
    )
    assert page.evaluate("window.getSelection()?.toString() || ''") == "", (
        "Touch swiping must not select page text"
    )
    assert not errors, errors[:5]
    session.detach()
    browser.close()

print("PASS: weight-chart touch swipes, chronological direction, reversible scrolling and no text selection")
