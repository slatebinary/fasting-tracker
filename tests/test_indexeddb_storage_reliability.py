#!/usr/bin/env python3
"""Static regression guards for IndexedDB snapshot and connection lifecycle reliability."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
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

storage_service = (ROOT / "js" / "fasting-storage-db.js").read_text(encoding="utf-8")
open_db = storage_service[storage_service.index("  function openAppDb() {"):storage_service.index("  function idbRequest(")]
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

# Ordinary writes and explicit restore/reset writes must all compare the database
# revision inside their own readwrite transaction before mutating any store.
write = function_body("  async function persistRecordStores(", "  function canonicalRecordFingerprint(")
assert "const expectedRevision = persistedDataRevision;" in write, "Write must use the tab's last committed revision as its baseline"
assert "const revisionRequest = state.get('settings');" in write, "Write must read the authoritative revision in its write transaction"
assert "actualRevision !== expectedRevision" in write and "FT_STALE_REVISION" in write, "Stale writes must abort atomically"
assert "if (!conflictError) reject" in write, "Transaction error handling must preserve the stale-revision conflict code"
assert write.index("actualRevision !== expectedRevision") < write.index("state.put({key:'settings'"), "No settings write may occur before the revision check"
assert write.index("actualRevision !== expectedRevision") < write.index("if (force) store.clear()"), "Forced collection replacement must not bypass stale-write protection"
assert "persistedDataRevision = Number(snapshotData.revision) || 0;" in write, "Committed writes must advance the tab's revision baseline"

reset = function_body("  async function persistFullResetAtomic(empty) {", "  function dataSettingsOnly(")
assert "actualRevision !== persistedDataRevision" in reset and "FT_STALE_REVISION" in reset, "Full reset must also reject a stale tab"
assert "if (!conflictError) reject" in reset, "Reset transaction errors must preserve stale-revision conflicts"
assert reset.index("actualRevision !== persistedDataRevision") < reset.index("state.clear();"), "Reset must compare revision before clearing stores"
assert "persistedDataRevision = Number(empty.revision) || 0;" in reset, "Successful reset must advance the revision baseline"
assert "persistedDataRevision = Number(data.revision) || 0;" in source[source.index("async function reloadFromIndexedDB"):], "Cross-tab reload must refresh the revision baseline"
assert "if (!primaryPersistScheduled) reloadFromIndexedDB({ notify: false });" in source, "External revision notifications must not discard an in-flight local edit before compare-and-swap"
assert "await handleStaleRevisionConflict();" in source[source.index("function queuePrimaryPersistence"):], "A rejected queued write must preserve local edits before reload"
assert "createInternalSnapshotAsync(" in source[source.index("async function handleStaleRevisionConflict"):source.index("async function reloadFromIndexedDB")], "Stale local edits must be snapshotted before reload"
assert "sync.conflictSnapshotSaved" in source and "sync.conflictSnapshotFailed" in source, "Conflict recovery outcomes must be announced"
assert "catch (err) { if (err?.code === 'FT_STALE_REVISION') await handleStaleRevisionConflict(); }" in source, "A rejected lifecycle flush must preserve local edits before reload"

print("PASS: atomic IndexedDB snapshot, connection lifecycle, revision compare-and-swap and conflict recovery")

if sync_playwright:
    version = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
    data = build_data(3)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        page = browser.new_page(viewport={"width": 390, "height": 844})
        errors = []
        console_errors = []
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        seeded_data = {**data, "appVersion": version}
        bootstrap = (
            "<script>(" + STORAGE_SHIM + ")();"
            + "window.__seedFastingDbV2(" + json.dumps(seeded_data) + ", []);"
            + "localStorage.setItem('fastingTracker.appMeta', "
            + json.dumps(json.dumps({"lastAppVersion": version})) + ");"
            + "</script>"
        )
        html = inlined_html().replace("<head>", "<head>" + bootstrap, 1)
        page.set_content(html, wait_until="domcontentloaded")
        try:
            page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent === 'v{version}'", timeout=30000)
        except Exception as exc:
            label = page.locator("#appVersionLabel").text_content() if page.locator("#appVersionLabel").count() else "<missing>"
            raise AssertionError(
                f"App startup did not publish version v{version}; label={label!r}; "
                f"page_errors={errors[:8]}; console_errors={console_errors[:8]}"
            ) from exc
        transactions = page.evaluate("window.__idbTransactions")
        assert not errors, (
            "Browser errors during storage startup: " + " | ".join(errors[:8])
            + f"; service_loaded={page.evaluate('!!window.FTStorageDB')}; open_calls={page.evaluate('window.__idbOpenCalls')}; transactions={transactions}"
            + "; console_errors=" + " | ".join(console_errors[:8])
        )
        expected = {"state", "records", "deletedFasts", "weights", "deletedWeights"}
        atomic_reads = [tx for tx in transactions if tx["mode"] == "readonly" and expected.issubset(set(tx["stores"]))]
        assert atomic_reads, (
            "App did not load all record stores in one readonly transaction: "
            + f"{transactions}; service_loaded={page.evaluate('!!window.FTStorageDB')}; open_calls={page.evaluate('window.__idbOpenCalls')}; "
            + f"page_errors={errors[:8]}; console_errors={console_errors[:8]}"
        )
        browser.close()

    with sync_playwright() as p:
        # Exercise two real same-origin pages against one native IndexedDB database.
        # Tab B queues a settings edit but holds its persistence frame; Tab A commits
        # first. Releasing B must hit the in-transaction revision guard, not overwrite A.
        class BlankHandler(BaseHTTPRequestHandler):
            app_html = ""
            def do_GET(self):
                body = self.app_html.encode("utf-8") if self.path == "/app" else b"<!doctype html><title>Fasting Tracker test origin</title>"
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *_args):
                pass
    
        server = ThreadingHTTPServer(("127.0.0.1", 0), BlankHandler)
        Thread(target=server.serve_forever, daemon=True).start()
        origin = f"http://127.0.0.1:{server.server_address[1]}/"
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = browser.new_context(viewport={"width": 390, "height": 844})
        tab_a, tab_b = context.new_page(), context.new_page()
        try:
            tab_a.goto(origin)
            tab_a.evaluate("""async ({data,version}) => {
              const request=indexedDB.open('FastingTrackerDB',2);
              request.onupgradeneeded=()=>{
                const db=request.result;
                for(const [name,keyPath] of [['state','key'],['snapshotMeta','id'],['snapshotPayload','id'],['records','id'],['deletedFasts','id'],['weights','id'],['deletedWeights','id']])
                  if(!db.objectStoreNames.contains(name)) db.createObjectStore(name,{keyPath});
              };
              await new Promise((resolve,reject)=>{
                request.onerror=()=>reject(request.error);
                request.onsuccess=()=>{
                  const db=request.result;
                  const tx=db.transaction(['state','records','deletedFasts','weights','deletedWeights'],'readwrite');
                  const settings={...data};delete settings.records;delete settings.deletedFasts;delete settings.weights;delete settings.deletedWeights;
                  tx.objectStore('state').put({key:'settings',storageGeneration:3,data:settings});
                  tx.objectStore('state').put({key:'dailyTotals',revision:data.revision,algorithmVersion:2,entries:[]});
                  tx.objectStore('state').put({key:'persistenceMeta',lastSuccessfulSaveAt:new Date().toISOString(),revision:data.revision});
                  for(const name of ['records','deletedFasts','weights','deletedWeights']) for(const item of data[name]||[]) tx.objectStore(name).put(item);
                  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
                };
              });
              localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:version}));
            }""", {"data": data, "version": version})
            BlankHandler.app_html = inlined_html()
            tab_a.goto(origin + "app")
            tab_a.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent === 'v{version}'", timeout=30000)
            tab_b.goto(origin + "app")
            tab_b.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent === 'v{version}'", timeout=30000)
            assert tab_a.evaluate("location.origin") == tab_b.evaluate("location.origin") == origin.rstrip("/")
            for page in (tab_a, tab_b):
                page.wait_for_function("document.querySelector('#appearanceSelect')?.value === 'system'", timeout=10000)
    
            tab_b.on("dialog", lambda dialog: dialog.accept())
            tab_b.evaluate("""() => {
              const nativeRaf=window.requestAnimationFrame.bind(window);
              window.__heldPrimaryRafs=[];
              window.__holdNextPrimaryRaf=true;
              window.requestAnimationFrame=callback=>{
                if(window.__holdNextPrimaryRaf){window.__holdNextPrimaryRaf=false;window.__heldPrimaryRafs.push(callback);return 9001;}
                return nativeRaf(callback);
              };
              const select=document.querySelector('#appearanceSelect');
              select.value='dark';select.dispatchEvent(new Event('change',{bubbles:true}));
            }""")
            tab_b.wait_for_function("window.__heldPrimaryRafs?.length === 1", timeout=5000)
            tab_a.evaluate("""() => {
              const select=document.querySelector('#appearanceSelect');
              select.value='light';select.dispatchEvent(new Event('change',{bubbles:true}));
            }""")
            tab_a.wait_for_function("""() => new Promise(resolve=>{
              const q=indexedDB.open('FastingTrackerDB',2);
              q.onerror=()=>resolve(false);
              q.onsuccess=()=>{const tx=q.result.transaction('state','readonly');const r=tx.objectStore('state').get('settings');r.onsuccess=()=>resolve(r.result?.data?.appearance==='light');r.onerror=()=>resolve(false);};
            })""", timeout=10000)
            tab_b.evaluate("() => { const callback=window.__heldPrimaryRafs.shift(); if(callback) callback(performance.now()); }")
            tab_b.wait_for_function("document.querySelector('#appearanceSelect')?.value === 'light'", timeout=15000)
            final_state = tab_a.evaluate("""() => new Promise((resolve,reject)=>{
              const q=indexedDB.open('FastingTrackerDB',2);q.onerror=()=>reject(q.error);q.onsuccess=()=>{
                const tx=q.result.transaction('state','readonly'),r=tx.objectStore('state').get('settings');
                r.onsuccess=()=>resolve(r.result?.data);r.onerror=()=>reject(r.error);
              };
            })""")
            assert final_state["appearance"] == "light", final_state

            assert final_state["revision"] == data["revision"] + 1, final_state
            conflict_snapshot = tab_b.evaluate("""async () => {
              const db=await new Promise((resolve,reject)=>{
                const q=indexedDB.open('FastingTrackerDB',2);
                q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);
              });
              const tx=db.transaction(['snapshotMeta','snapshotPayload'],'readonly');
              const metas=await new Promise((resolve,reject)=>{const r=tx.objectStore('snapshotMeta').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
              const meta=metas.find(row=>row.reason==='cross-tab-conflict');
              if(!meta)return {meta:null,payload:null};
              const row=await new Promise((resolve,reject)=>{const r=tx.objectStore('snapshotPayload').get(meta.id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
              let payload=row?.data||null;
              if(!payload&&row?.encoding==='json')payload=JSON.parse(row.json);
              if(!payload&&row?.encoding==='gzip-json'){
                const raw=await new Response(row.blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
                payload=JSON.parse(raw);
              }
              return {meta,payload};
            }""")
            assert conflict_snapshot["meta"], "Stale tab's unsaved changes were not preserved as a recovery snapshot"
            assert conflict_snapshot["meta"]["label"] == "Unsaved changes from this tab", conflict_snapshot["meta"]
            assert conflict_snapshot["meta"]["revision"] == data["revision"] + 1, conflict_snapshot["meta"]
            assert conflict_snapshot["payload"]["appearance"] == "dark", conflict_snapshot["payload"]
            assert conflict_snapshot["payload"]["revision"] == data["revision"] + 1, conflict_snapshot["payload"]
        finally:
            context.close()
            browser.close()
            server.shutdown()
            server.server_close()
        print("PASS: browser startup uses one readonly IndexedDB transaction; real same-origin tabs reject stale settings writes without overwriting the committed tab")
