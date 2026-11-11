#!/usr/bin/env python3
"""Regression: weight period controls sit with the chart and remain fully visible."""
import json
from pathlib import Path
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
DATA = build_data(80)

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/chromium",
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )
    for width, expected_columns in ((390, 3), (1280, 6)):
        page = browser.new_page(viewport={"width": width, "height": 900})
        errors = []
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.evaluate(STORAGE_SHIM)
        page.evaluate(
            """arg => {
              __seedFastingDbV2(arg.data, []);
              localStorage.setItem('fastingTracker.appMeta', JSON.stringify({
                lastAppVersion: arg.version, seenAt: new Date().toISOString()
              }));
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
        page.wait_for_function(
            "document.querySelector('#weight.screen')?.classList.contains('active')",
            timeout=5000,
        )

        selector = page.locator("#weightPeriodSwitcher")
        assert selector.is_visible(), "Period selector must be visible"
        assert selector.evaluate(
            "e => e.closest('.weightChartWrap') === document.querySelector('.weightChartWrap')"
        ), "Period selector must belong to the Weight trend card"
        assert selector.evaluate(
            "e => !!(e.compareDocumentPosition(document.querySelector('.weightChartShell')) & Node.DOCUMENT_POSITION_FOLLOWING)"
        ), "Period selector must appear before the chart"
        aria_label = (selector.get_attribute("aria-label") or "").lower()\n        assert aria_label and any(word in aria_label for word in ("period", "период", "período")), (width, aria_label)
        assert selector.locator("button").count() == 6
        layout = selector.evaluate(
            """e => ({
              columns: getComputedStyle(e).gridTemplateColumns.split(' ').length,
              client: e.clientWidth,
              scroll: e.scrollWidth,
              buttons: [...e.querySelectorAll('button')].map(b => ({
                left: b.getBoundingClientRect().left,
                right: b.getBoundingClientRect().right,
                visible: b.getBoundingClientRect().width > 0
              }))
            })"""
        )
        assert layout["columns"] == expected_columns, (width, layout)
        assert layout["scroll"] <= layout["client"] + 1, (width, layout)
        assert all(
            b["visible"] and b["left"] >= 0 and b["right"] <= width
            for b in layout["buttons"]
        ), (width, layout)

        page.locator('[data-weight-period="month"]').click()
        page.wait_for_function(
            "document.querySelector('#weightChartScroller')?.dataset.period === 'month'"
        )
        assert page.locator('[data-weight-period="month"]').get_attribute("aria-selected") == "true"
        assert page.locator('[data-weight-period="daily"]').get_attribute("aria-selected") == "false"
        assert page.locator("#weightPeriodRange").inner_text().strip(), "Selected period range must remain visible with the selector"
        assert not errors, errors[:5]
        page.close()
    browser.close()

print("PASS: weight period selector is grouped with the chart, all six options fit on mobile/desktop, and selection remains accessible")
