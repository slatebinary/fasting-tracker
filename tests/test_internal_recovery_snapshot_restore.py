#!/usr/bin/env python3
"""End-to-end regression for internal recovery-snapshot creation and restoration."""
import datetime
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURRENT_VERSION = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM

try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}")
    sys.exit(0)


LABEL = "E2E recovery baseline"


def read_primary(page):
    return page.evaluate("""() => new Promise((resolve, reject) => {
      const request = indexedDB.open('FastingTrackerDB', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['state','records','deletedFasts','weights','deletedWeights'], 'readonly');
        const state = tx.objectStore('state').get('settings');
        const result = {records:null, deletedFasts:null, weights:null, deletedWeights:null};
        for (const name of ['records','deletedFasts','weights','deletedWeights']) {
          const read = tx.objectStore(name).getAll();
          read.onsuccess = () => { result[name] = read.result; };
          read.onerror = () => reject(read.error);
        }
        state.onsuccess = () => { result.settings = state.result?.data || {}; };
        state.onerror = () => reject(state.error);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      };
    })""")


def read_snapshots(page):
    return page.evaluate("""() => new Promise((resolve, reject) => {
      const request = indexedDB.open('FastingTrackerDB', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const tx = request.result.transaction(['snapshotMeta','snapshotPayload'], 'readonly');
        const meta = tx.objectStore('snapshotMeta').getAll();
        const payload = tx.objectStore('snapshotPayload').getAll();
        let m, p;
        meta.onsuccess = () => { m = meta.result; };
        payload.onsuccess = () => { p = payload.result; };
        meta.onerror = payload.onerror = () => reject(meta.error || payload.error);
        tx.oncomplete = () => resolve({meta:m || [], payload:p || []});
        tx.onerror = () => reject(tx.error);
      };
    })""")


def wait_counts(page, expected, timeout=15):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = read_primary(page)
        actual = {
            "records": len(last["records"] or []),
            "deletedFasts": len(last["deletedFasts"] or []),
            "weights": len(last["weights"] or []),
            "deletedWeights": len(last["deletedWeights"] or []),
        }
        if actual == expected:
            return last
        time.sleep(0.1)
    raise AssertionError(f"IndexedDB did not reach {expected}; last counts were {actual}")


def ids(rows):
    return sorted(row["id"] for row in rows)


def audit_fields(row):
    return {key: row.get(key) for key in ("id", "deleted", "deletedAt", "deletedTimeZone", "deletionReason")}


def main():
    data = build_data(3)
    now = datetime.datetime.now(datetime.timezone.utc)
    active_start = (now - datetime.timedelta(hours=4)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    active_created = (now - datetime.timedelta(hours=5)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    active_modified = (now - datetime.timedelta(hours=3)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    data.update({
        "activeStart": active_start,
        "activeGoalHours": 20,
        "activeTimeZone": "UTC",
        "activeCreatedAt": active_created,
        "activeModifiedAt": active_modified,
    })

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/usr/bin/chromium",
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(viewport={"width": 390, "height": 844}, timezone_id="UTC")
        errors = []
        dialogs = []
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.on("dialog", lambda dialog: (dialogs.append(dialog.message), dialog.accept()))
        page.evaluate(STORAGE_SHIM)
        page.evaluate(
            """arg => {
              __seedFastingDbV2(arg.data, []);
              localStorage.setItem('fastingTracker.appMeta', JSON.stringify({
                lastAppVersion: arg.version, seenAt: new Date().toISOString()
              }));
            }""",
            {"data": data, "version": CURRENT_VERSION},
        )
        page.set_content(inlined_html(), wait_until="domcontentloaded")
        page.wait_for_function(
            "v => document.querySelector('#appVersionLabel')?.textContent === 'v' + v",
            arg=CURRENT_VERSION,
            timeout=20000,
        )
        page.wait_for_timeout(250)

        # Create genuine audited tombstones through the normal application UI.
        page.locator('.tab[data-screen="history"]').click()
        page.wait_for_function("document.querySelectorAll('#historyList .historyRow').length === 3")
        page.locator("#historyList .historyRow").first.locator(".dangerText").click()
        wait_counts(page, {"records":2, "deletedFasts":1, "weights":3, "deletedWeights":0})

        page.locator('.tab[data-screen="weight"]').click()
        page.wait_for_function("document.querySelectorAll('#weightHistoryList .historyRow').length === 3")
        page.locator("#weightHistoryList .historyRow").first.locator(".dangerText").click()
        wait_counts(page, {"records":2, "deletedFasts":1, "weights":2, "deletedWeights":1})

        # Save a named internal snapshot through the actual Settings workflow.
        page.locator('.tab[data-screen="settings"]').click()
        for selector in ("#settingsGroupAdvanced", "#settingsGroupData"):
            group = page.locator(selector)
            if not group.evaluate("(node) => node.open"):
                page.locator(f"{selector} > summary").click()
        page.locator("#createSnapshotBtn").click()
        page.wait_for_function("!document.querySelector('#manualSnapshotModal').hidden")
        page.locator("#manualSnapshotLabel").fill(LABEL)
        page.locator("#manualSnapshotSaveBtn").click()
        page.wait_for_function("document.querySelector('#manualSnapshotModal').hidden", timeout=10000)

        baseline = wait_counts(page, {"records":2, "deletedFasts":1, "weights":2, "deletedWeights":1})
        baseline_snapshots = read_snapshots(page)
        baseline_meta = next((row for row in baseline_snapshots["meta"] if row.get("label") == LABEL), None)
        assert baseline_meta, "Named recovery snapshot metadata was not committed"
        assert baseline_meta.get("fastingRecords") == 2
        assert baseline_meta.get("deletedFasts") == 1
        assert baseline_meta.get("weightRecords") == 2
        assert baseline_meta.get("deletedWeights") == 1
        baseline_payload = next((row for row in baseline_snapshots["payload"] if row.get("id") == baseline_meta["id"]), None)
        assert baseline_payload, "Named recovery snapshot payload was not committed"

        # Deliberately change live data after the snapshot: restore each tombstone,
        # then delete a different active record/measurement.
        page.locator('.tab[data-screen="history"]').click()
        page.locator("#deletedFastsList .secondary").first.click()
        wait_counts(page, {"records":3, "deletedFasts":0, "weights":2, "deletedWeights":1})
        page.locator("#historyList .historyRow").nth(1).locator(".dangerText").click()
        wait_counts(page, {"records":2, "deletedFasts":1, "weights":2, "deletedWeights":1})

        page.locator('.tab[data-screen="weight"]').click()
        page.locator("#deletedWeightsList .secondary").first.click()
        wait_counts(page, {"records":2, "deletedFasts":1, "weights":3, "deletedWeights":0})
        page.locator("#weightHistoryList .historyRow").nth(1).locator(".dangerText").click()
        mutated = wait_counts(page, {"records":2, "deletedFasts":1, "weights":2, "deletedWeights":1})

        assert ids(mutated["records"]) != ids(baseline["records"]) or ids(mutated["deletedFasts"]) != ids(baseline["deletedFasts"])
        assert ids(mutated["weights"]) != ids(baseline["weights"]) or ids(mutated["deletedWeights"]) != ids(baseline["deletedWeights"])

        # Open the snapshot catalogue, preview the named point, and restore it.
        page.locator('.tab[data-screen="settings"]').click()
        for selector in ("#settingsGroupAdvanced", "#settingsGroupData"):
            group = page.locator(selector)
            if not group.evaluate("(node) => node.open"):
                page.locator(f"{selector} > summary").click()
        page.locator("#restoreSnapshotBtn").click()
        page.wait_for_function("!document.querySelector('#snapshotModal').hidden")
        page.locator("#snapshotList .snapshotItem").filter(has_text=LABEL).locator("button").click()
        page.wait_for_function("!document.querySelector('#snapshotPreviewModal').hidden")
        page.locator("#snapshotPreviewRestoreBtn").click()

        restored = wait_counts(page, {"records":2, "deletedFasts":1, "weights":2, "deletedWeights":1})
        assert ids(restored["records"]) == ids(baseline["records"]), "Completed fasting records were not restored"
        assert ids(restored["deletedFasts"]) == ids(baseline["deletedFasts"]), "Deleted fasting audit records were not restored"
        assert ids(restored["weights"]) == ids(baseline["weights"]), "Active weight measurements were not restored"
        assert ids(restored["deletedWeights"]) == ids(baseline["deletedWeights"]), "Deleted weight audit records were not restored"

        for field in ("activeStart", "activeGoalHours", "activeTimeZone", "activeCreatedAt", "activeModifiedAt"):
            assert restored["settings"].get(field) == baseline["settings"].get(field), (
                f"Active fast metadata changed during snapshot restoration: {field}"
            )
        assert restored["settings"].get("activeStart") == active_start
        assert restored["settings"].get("activeGoalHours") == 20
        assert restored["settings"].get("activeTimeZone") == "UTC"

        for before, after in zip(sorted(baseline["deletedFasts"], key=lambda row: row["id"]),
                                 sorted(restored["deletedFasts"], key=lambda row: row["id"])):
            assert audit_fields(after) == audit_fields(before), "Deleted fasting audit metadata changed"
        for before, after in zip(sorted(baseline["deletedWeights"], key=lambda row: row["id"]),
                                 sorted(restored["deletedWeights"], key=lambda row: row["id"])):
            assert audit_fields(after) == audit_fields(before), "Deleted weight audit metadata changed"

        # The restore operation must first preserve the pre-restore live dataset
        # as a separate internal safety snapshot.
        final_snapshots = read_snapshots(page)
        safety = [row for row in final_snapshots["meta"] if row.get("reason") == "before restoring another snapshot"]
        assert safety, "Restore did not create a pre-restore safety snapshot"
        safety_row = max(safety, key=lambda row: row.get("createdAt", ""))
        assert safety_row.get("fastingRecords") == len(mutated["records"])
        assert safety_row.get("deletedFasts") == len(mutated["deletedFasts"])
        assert safety_row.get("weightRecords") == len(mutated["weights"])
        assert safety_row.get("deletedWeights") == len(mutated["deletedWeights"])
        assert any(row.get("id") == safety_row["id"] for row in final_snapshots["payload"]), (
            "Pre-restore safety snapshot payload was not committed"
        )

        assert not errors, "Browser errors during snapshot restore: " + " | ".join(errors[:5])
        browser.close()

    print("PASS: internal snapshot creation, full restoration, active-fast metadata, deleted-record audit trails and pre-restore safety snapshot")


if __name__ == "__main__":
    main()
