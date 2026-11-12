#!/usr/bin/env python3
"""Regression: Weight History bulk selection, filter/range resets, deletion and restore."""
import sys, json, datetime, re
from pathlib import Path
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
now = datetime.datetime.now(datetime.timezone.utc)
base_ms = int((now + datetime.timedelta(hours=16)).timestamp() * 1000)
data = build_data(12, base=base_ms)

try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}")
    sys.exit(0)

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/chromium",
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )
    page = browser.new_page(viewport={"width": 390, "height": 844}, timezone_id="UTC")
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.on("dialog", lambda dialog: dialog.accept())
    page.evaluate(STORAGE_SHIM)
    page.evaluate(
        """arg => {
          __seedFastingDbV2(arg.data, []);
          localStorage.setItem('fastingTracker.appMeta', JSON.stringify({
            lastAppVersion: arg.version, seenAt: new Date().toISOString()
          }));
        }""",
        {"data": data, "version": VERSION},
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
    page.locator("#weightTools > summary").click()
    page.wait_for_function("document.querySelector('#weightTools')?.open === true", timeout=5000)
    rows = page.locator("#weightHistoryList .historyRow")
    page.wait_for_function(
        "document.querySelectorAll('#weightHistoryList .historyRow').length === 7",
        timeout=10000,
    )

    def selected_count(selector):
        text = page.locator(selector).inner_text()
        match = re.search(r"\d+", text)
        assert match, f"Selection count is not numeric: {text!r}"
        return int(match.group())

    # Enter bulk mode: only the seven currently visible records are selectable.
    mode = page.locator("#weightBulkModeBtn")
    mode.click()
    assert mode.get_attribute("aria-pressed") == "true"
    assert page.locator("#weightBulkBar").is_visible()
    checkboxes = rows.locator('input[type="checkbox"]')
    assert checkboxes.count() == 7
    assert page.locator("#weightBulkExportBtn").is_disabled()
    assert page.locator("#weightBulkDeleteBtn").is_disabled()

    # Select visible, manually deselect one, and verify the live count/actions.
    page.locator("#weightSelectVisibleBtn").click()
    assert selected_count("#weightBulkCount") == 7
    assert checkboxes.count() == 7
    assert checkboxes.evaluate_all("nodes => nodes.every(node => node.checked)")
    assert page.locator("#weightBulkExportBtn").is_enabled()
    assert page.locator("#weightBulkDeleteBtn").is_enabled()
    checkboxes.first.uncheck()
    assert selected_count("#weightBulkCount") == 6

    # Changing a date filter clears the selection and returns to the compact view.
    from_date = (now - datetime.timedelta(days=3)).date().isoformat()
    page.locator("#weightFilterFrom").fill(from_date)
    page.wait_for_function(
        "document.querySelectorAll('#weightHistoryList .historyRow input[type=checkbox]:checked').length === 0",
        timeout=5000,
    )
    assert selected_count("#weightBulkCount") == 0
    assert page.locator("#weightHistoryRange").input_value() == ""
    assert 1 <= rows.count() <= 7

    # Clear the filter, expand all history, and verify range changes also clear selection.
    page.locator("#weightClearFiltersBtn").click()
    page.wait_for_function(
        "document.querySelectorAll('#weightHistoryList .historyRow').length === 7",
        timeout=5000,
    )
    more = page.locator("#weightHistoryMoreBtn")
    more.click()
    history_range = page.locator("#weightHistoryRange")
    assert history_range.is_visible()
    history_range.select_option("all")
    page.wait_for_function(
        "document.querySelectorAll('#weightHistoryList .historyRow').length === 12",
        timeout=5000,
    )
    assert selected_count("#weightBulkCount") == 0

    # Bulk-delete all 12 selected measurements into the auditable deleted list.
    page.locator("#weightSelectVisibleBtn").click()
    assert selected_count("#weightBulkCount") == 12
    assert page.locator("#weightHistoryList .historyRow input[type=checkbox]:checked").count() == 12
    page.locator("#weightBulkDeleteBtn").click()
    page.wait_for_function(
        "document.querySelectorAll('#weightHistoryList .historyRow').length === 0 && !document.querySelector('#deletedWeightsCard').hidden",
        timeout=10000,
    )
    assert selected_count("#weightBulkCount") == 0
    assert page.locator("#deletedWeightsList .historyRow").count() == 12
    assert page.locator("#deletedWeightBulkBar").is_visible()
    assert page.locator("#deletedWeightBulkRestoreBtn").is_disabled()

    # Select and restore the deleted measurements; verify raw records are back.
    page.locator("#deletedWeightSelectVisibleBtn").click()
    assert selected_count("#deletedWeightBulkCount") == 12
    assert page.locator("#deletedWeightsList .historyRow input[type=checkbox]:checked").count() == 12
    assert page.locator("#deletedWeightBulkRestoreBtn").is_enabled()
    page.locator("#deletedWeightBulkRestoreBtn").click()
    page.wait_for_function(
        "document.querySelector('#deletedWeightsCard').hidden && document.querySelectorAll('#weightHistoryList .historyRow').length === 7",
        timeout=10000,
    )
    # save() queues IndexedDB persistence; wait for the committed store state,
    # rather than reading the stores immediately after the synchronous UI render.
    page.wait_for_function("""() => new Promise(resolve => {
      const request = indexedDB.open('FastingTrackerDB', 2);
      request.onsuccess = () => {
        const tx = request.result.transaction(['weights', 'deletedWeights'], 'readonly');
        const active = tx.objectStore('weights').getAll();
        const deleted = tx.objectStore('deletedWeights').getAll();
        tx.oncomplete = () => resolve(active.result.length === 12 && deleted.result.length === 0);
        tx.onerror = () => resolve(false);
      };
      request.onerror = () => resolve(false);
    })""", timeout=15000)
    counts = page.evaluate("""() => new Promise(resolve => {
      const request = indexedDB.open('FastingTrackerDB', 2);
      request.onsuccess = () => {
        const tx = request.result.transaction(['weights', 'deletedWeights'], 'readonly');
        const active = tx.objectStore('weights').getAll();
        const deleted = tx.objectStore('deletedWeights').getAll();
        tx.oncomplete = () => resolve({active: active.result.length, deleted: deleted.result.length});
      };
      request.onerror = () => resolve({error: String(request.error)});
    })""")
    assert counts == {"active": 12, "deleted": 0}, counts
    assert not errors, errors[:5]
    browser.close()

print("PASS: Weight History bulk selection counts, filter/range reset, auditable bulk delete and restore")
