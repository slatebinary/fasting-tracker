#!/usr/bin/env python3
"""Synthetic persisted-record startup guard for the v1.12.8 app.

This is not a real v1.12.6-to-v1.12.8 browser-profile upgrade simulation:
IndexedDB and localStorage are supplied by STORAGE_SHIM. Keep this limitation
explicit until a native IndexedDB, same-origin version-transition test exists.
"""
from playwright.sync_api import sync_playwright
from browser_perf_common import STORAGE_SHIM, build_data, inlined_html


def inspect_record_stores(page):
    return page.evaluate("""() => new Promise((resolve, reject) => {
      const q = indexedDB.open('FastingTrackerDB', 2);
      q.onerror = () => reject(q.error);
      q.onsuccess = () => {
        const db = q.result;
        const tx = db.transaction(['records', 'weights', 'state'], 'readonly');
        const records = tx.objectStore('records').getAll();
        const weights = tx.objectStore('weights').getAll();
        const meta = tx.objectStore('state').get('settings');
        let r, w, s;
        const finish = () => {
          if (r && w && s) resolve({
            records: r, weights: w,
            storageGeneration: s.storageGeneration,
            settings: s.data
          });
        };
        records.onsuccess = () => { r = records.result; finish(); };
        weights.onsuccess = () => { w = weights.result; finish(); };
        meta.onsuccess = () => { s = meta.result || {}; finish(); };
        records.onerror = weights.onerror = meta.onerror = () => reject(records.error || weights.error || meta.error);
      };
    })""")


def main():
    expected = build_data(16)
    expected_ids = [r["id"] for r in expected["records"]]
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/usr/bin/chromium", headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        page = browser.new_page(viewport={"width": 390, "height": 844})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.evaluate(STORAGE_SHIM)
        page.evaluate("""payload => {
          __seedFastingDbV2(payload, []);
          localStorage.setItem('fastingTracker.appMeta', JSON.stringify({
            lastAppVersion: '1.12.6'
          }));
        }""", expected)
        page.set_content(inlined_html(), wait_until="domcontentloaded")
        page.wait_for_function(
            "document.querySelector('#appVersionLabel')?.textContent === 'v1.12.8'",
            timeout=20000
        )

        state = inspect_record_stores(page)
        actual_ids = [r["id"] for r in state["records"]]
        assert actual_ids == expected_ids, (
            "Upgrade changed or lost completed fasting records: "
            f"expected {len(expected_ids)} in original order, got {len(actual_ids)}"
        )
        assert len(state["weights"]) == len(expected["weights"]), (
            "Upgrade changed the weight-record count"
        )
        assert state["settings"].get("activeStart") is None, (
            "Upgrade unexpectedly created an active fast"
        )

        page.locator('.tab[data-screen="history"]').click()
        page.wait_for_function(
            "() => document.querySelectorAll('#historyList .historyRow').length === 16",
            timeout=10000
        )
        visible_rows = page.locator("#historyList .historyRow").count()
        assert visible_rows == 16, f"History UI shows {visible_rows} rows instead of 16"
        assert not errors, f"JavaScript errors during upgrade: {errors[:5]}"
        browser.close()
    print("PASS: synthetic v1.12.8 startup guard preserves 16 seeded fasts, weights, and History rows (storage shim; not a real version-transition test)")


if __name__ == "__main__":
    main()
