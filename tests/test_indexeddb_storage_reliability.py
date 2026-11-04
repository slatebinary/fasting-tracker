#!/usr/bin/env python3
"""Static regression guards for IndexedDB snapshot and connection lifecycle reliability."""
from pathlib import Path
import re

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
