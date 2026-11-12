#!/usr/bin/env python3
"""Regression: weight period controls sit with the chart and remain fully visible."""
# Check both the visual grouping and responsive accessibility behavior.
import json
import time
from pathlib import Path
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
DATA = build_data(80, base=int(time.time() * 1000))

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/chromium",
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )
    for width, expected_columns in ((390, 3), (1280, 6)):
        page = browser.new_page(viewport={"width": width, "height": 900}, timezone_id="UTC")
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

        # The list starts with the seven newest measurements. Older history
        # is revealed through a compact button and a period dropdown.
        history_rows = page.locator("#weightHistoryList .historyRow")
        page.wait_for_function(
            "document.querySelectorAll('#weightHistoryList .historyRow').length === 7",
            timeout=10000,
        )
        assert history_rows.count() == 7
        weight_count = page.locator("#weightHistoryVisibleCount")
        assert weight_count.is_visible()
        assert weight_count.inner_text() == "Last 7 measurements"
        history_button = page.locator("#weightHistoryMoreBtn")
        history_range = page.locator("#weightHistoryRange")
        assert history_button.is_visible()
        assert history_button.inner_text() == "More…"
        assert history_range.is_hidden()
        history_button.click()
        assert history_range.is_visible()
        assert history_button.inner_text() == "Close"
        history_range.select_option("month")
        assert 27 <= history_rows.count() <= 32, history_rows.count()
        assert weight_count.inner_text() == f"Last {history_rows.count()} measurements"
        assert history_button.inner_text() == "Last 7"
        history_range.select_option("halfyear")
        assert history_rows.count() == 80
        history_range.select_option("year")
        assert history_rows.count() == 80
        history_range.select_option("all")
        assert history_rows.count() == 80
        history_button.click()
        assert history_rows.count() == 7
        assert history_range.is_hidden()
        assert history_button.inner_text() == "More…"

        # Applying a date filter from the All range must return to the compact
        # seven-entry view while retaining an accurate count of all matches.
        history_button.click()
        history_range.select_option("all")
        assert history_rows.count() == 80
        from_date = page.evaluate("""() => {
          const d = new Date(Date.now() - 15 * 86400000);
          return d.toISOString().slice(0, 10);
        }""")
        page.locator("#weightFilterFrom").fill(from_date)
        page.wait_for_function(
            "document.querySelectorAll('#weightHistoryList .historyRow').length === 7",
            timeout=5000,
        )
        filter_summary = page.locator("#weightFilterStatus").inner_text()
        matched_count = int(filter_summary.split()[1])
        assert matched_count > 7, filter_summary
        assert history_rows.count() == 7
        assert weight_count.inner_text() == "Last 7 measurements"
        assert history_button.inner_text() == "More…"
        assert history_range.is_hidden()
        assert history_range.input_value() == ""

        page.locator("#weightClearFiltersBtn").click()
        page.wait_for_function(
            "document.querySelector('#weightFilterStatus')?.textContent.includes('80')",
            timeout=5000,
        )
        assert history_rows.count() == 7
        assert weight_count.inner_text() == "Last 7 measurements"

        # Fasting History uses the same seven-entry default, live count,
        # and period selector as Weight History.
        page.locator('.tab[data-screen="history"]').click()
        page.wait_for_function("document.querySelector('#history.screen')?.classList.contains('active')", timeout=5000)
        fast_rows = page.locator("#historyList .historyRow")
        page.wait_for_function("document.querySelectorAll('#historyList .historyRow').length === 7", timeout=10000)
        fast_count = page.locator("#historyVisibleCount")
        assert fast_count.is_visible()
        assert fast_count.inner_text() == "Last 7 fasts"
        fast_button = page.locator("#historyMoreBtn")
        fast_range = page.locator("#historyRange")
        assert fast_button.inner_text() == "More…"
        fast_button.click()
        assert fast_range.is_visible()
        fast_range.select_option("month")
        assert 27 <= fast_rows.count() <= 33, fast_rows.count()
        assert fast_count.inner_text() == f"Last {fast_rows.count()} fasts"
        assert fast_button.inner_text() == "Last 7"
        fast_range.select_option("halfyear")
        assert fast_rows.count() == 80
        fast_range.select_option("year")
        assert fast_rows.count() == 80
        fast_range.select_option("all")
        assert fast_rows.count() == 80
        assert fast_count.inner_text() == "Last 80 fasts"
        fast_button.click()
        assert fast_rows.count() == 7
        assert fast_count.inner_text() == "Last 7 fasts"
        assert fast_range.is_hidden()

        page.locator('.tab[data-screen="weight"]').click()
        page.wait_for_function("document.querySelector('#weight.screen')?.classList.contains('active')", timeout=5000)
        style_switcher=page.locator("#weightChartStyleSwitcher")
        assert style_switcher.is_visible(), "Rolling/fixed mode buttons must be visible above the weight period selector"
        assert style_switcher.locator("button").count()==2
        assert style_switcher.locator('[data-weight-style="rolling"]').get_attribute("aria-pressed")=="true"
        style_switcher.locator('[data-weight-style="fixed"]').click()
        assert style_switcher.locator('[data-weight-style="fixed"]').get_attribute("aria-pressed")=="true"
        assert page.evaluate("localStorage.getItem('fastingTracker.weightChartStyle')")=="fixed"
        style_switcher.locator('[data-weight-style="rolling"]').click()

        # The chart-data disclosure must keep its label, ARIA state and actual
        # visibility synchronized in both directions.
        data_button = page.locator("#weightChartDataBtn")
        data_box = page.locator("#weightChartData")
        assert data_button.get_attribute("aria-expanded") == "false"
        assert data_box.is_hidden()
        assert data_button.inner_text() == "Show chart data"
        data_button.click()
        assert data_button.get_attribute("aria-expanded") == "true"
        assert data_box.is_visible(), "Show chart data must reveal the chart data"
        assert data_button.inner_text() == "Hide chart data"
        data_button.click()
        assert data_button.get_attribute("aria-expanded") == "false"
        assert data_box.is_hidden(), "Hide chart data must conceal the chart data"
        assert data_button.inner_text() == "Show chart data"

        selector = page.locator("#weightPeriodSwitcher")
        assert selector.is_visible(), "Period selector must be visible"
        assert selector.evaluate(
            "e => e.closest('.weightChartWrap') === document.querySelector('.weightChartWrap')"
        ), "Period selector must belong to the Weight trend card"
        assert selector.evaluate(
            "e => !!(e.compareDocumentPosition(document.querySelector('.weightChartShell')) & Node.DOCUMENT_POSITION_FOLLOWING)"
        ), "Period selector must appear before the chart"
        aria_label = (selector.get_attribute("aria-label") or "").lower()
        assert aria_label and any(word in aria_label for word in ("period", "период", "período")), (width, aria_label)
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
