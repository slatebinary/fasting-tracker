#!/usr/bin/env python3
"""Static regression guards for IndexedDB snapshot and connection lifecycle reliability."""
from pathlib import Path
import json
import re
import sys
from browser_perf_common import STORAGE_SHIM, build_data, inlined_html

try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}")
    sync_playwright = None

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / "index.html").read_text(encoding="utf-8")

def function_body(name, next_marker):
    start = source.index(name)
    end = source.index(next_marker, start)
    return source[start:end]

open_db = function_body("  function openAppDb() {", "  function idbRequest(")
snapshot = function_body("  async function loadRecordBasedSnapshot() {", "  async function loadCompatibleStorageSource()")
restore = function_body("  async function persistResolvedDataAtomic(candidate) {", "  function persistResolvedData(candidate) {")

required_stores = ["state", "records", "deletedFasts", "weights", "deletedWeights"]
assert re.search(r"db\.transaction\(storeNames,\s*'readonly'\)", snapshot), "Record snapshot must use one readonly transaction"
for store in required_stores:
    assert f"'{store}'" in snapshot, f"Atomic snapshot missing {store} store"
assert "'dailyTotals'" in snapshot and "read(state, 'dailyTotals'" in snapshot, "Daily totals must share the record snapshot transaction"
assert "Promise.all" not in snapshot and "idbGetAll(" not in snapshot, "Snapshot reads must not use separate transactions"
assert "loadRecordBasedSnapshot()" in source[source.index("async function reloadFromIndexedDB"):], "Cross-tab reload must use the atomic snapshot"
assert "recordSnapshot?.dailyTotals" in source[source.index("async function reloadFromIndexedDB"):], "Reload must use daily totals from the same snapshot"

assert "db.onversionchange = releaseConnection" in open_db, "Old tabs must close their connection on versionchange"
assert "appDbPromise = null" in open_db and "pending.catch" in open_db, "Failed/closed opens must not leave a cached unusable promise"
assert "req.onblocked = () => noteDiagnosticError('idb_open_blocked')" in open_db, "Blocked opens must remain retryable instead of rejecting prematurely"

assert "await persistRecordStores(data, {force:true});" in restore, "Restore must commit IndexedDB before mirroring preferences"
assert restore.index("await persistRecordStores(data, {force:true});") < restore.index("persistSmallPreferences();"), "Preference mirror must update only after successful IndexedDB commit"

print("PASS: atomic IndexedDB snapshot, connection lifecycle and post-commit preference guards")

if sync_playwright:
    version = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
    data = build_data(3)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        page = browser.new_page(viewport={"width": 390, "height": 844})
        errors = []
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.evaluate(STORAGE_SHIM)
        page.evaluate("""data => {
          __seedFastingDbV2(data, []);
          localStorage.setItem("fastingTracker.appMeta", JSON.stringify({lastAppVersion: data.appVersion}));
        }""", {**data, "appVersion": version})
        page.set_content(inlined_html(), wait_until="domcontentloaded")
        page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent === 'v{version}'", timeout=30000)
        transactions = page.evaluate("window.__idbTransactions")
        expected = {"state", "records", "deletedFasts", "weights", "deletedWeights"}
        atomic_reads = [tx for tx in transactions if tx["mode"] == "readonly" and expected.issubset(set(tx["stores"]))]
        assert atomic_reads, f"App did not load all record stores in one readonly transaction: {transactions}"
        assert not errors, "Browser errors during storage startup: " + " | ".join(errors[:3])
        browser.close()
    print("PASS: browser startup uses one readonly IndexedDB transaction for all authoritative record stores")
