#!/usr/bin/env python3
"""Native IndexedDB, same-origin v1.12.6 -> v1.12.8 history preservation test.

The browser loads each historical source tree from the same localhost origin and
uses one persistent Chromium context. No IndexedDB/localStorage shim is installed.
Records are seeded into the app's real IndexedDB stores after v1.12.6 initializes.
"""
import json
import os
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright

V1126 = Path("/tmp/ft-v1126").resolve()
V1128 = Path("/tmp/ft-v1128").resolve()
active_root = V1126
ROOT_LOCK = threading.Lock()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="/", **kwargs)

    def translate_path(self, path):
        from urllib.parse import urlsplit, unquote
        rel = unquote(urlsplit(path).path).lstrip("/") or "index.html"
        with ROOT_LOCK:
            root = active_root
        target = (root / rel).resolve()
        if not target.is_relative_to(root):
            return str(root / "__not_found__")
        return str(target)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def do_GET(self):
        # Serve Jekyll's front-matter HTML as a normal page during this test.
        from urllib.parse import urlsplit
        rel = urlsplit(self.path).path.lstrip("/") or "index.html"
        with ROOT_LOCK:
            root = active_root
        if rel == "index.html":
            raw = (root / rel).read_text(encoding="utf-8")
            if raw.startswith("---"):
                parts = raw.split("---", 2)
                if len(parts) == 3:
                    raw = parts[2].lstrip("\r\n")
            body = raw.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def log_message(self, *args):
        pass


def make_records():
    records, weights = [], []
    base = 1_760_000_000_000
    for i in range(16):
        start = base + i * 86_400_000
        records.append({
            "id": f"native-fast-{i:02d}",
            "start": __import__("datetime").datetime.fromtimestamp(start / 1000, __import__("datetime").timezone.utc).isoformat().replace("+00:00", "Z"),
            "end": __import__("datetime").datetime.fromtimestamp((start + 16 * 3_600_000) / 1000, __import__("datetime").timezone.utc).isoformat().replace("+00:00", "Z"),
            "goalHours": 16, "timeZone": "UTC", "createdAt": None, "modifiedAt": None
        })
        weights.append({
            "id": f"native-weight-{i:02d}",
            "when": __import__("datetime").datetime.fromtimestamp((start + 8 * 3_600_000) / 1000, __import__("datetime").timezone.utc).isoformat().replace("+00:00", "Z"),
            "kg": 80 - i * 0.1, "timeZone": "UTC", "createdAt": None, "modifiedAt": None
        })
    return records, weights


def read_counts(page):
    return page.evaluate("""() => new Promise((resolve, reject) => {
      const q = indexedDB.open('FastingTrackerDB', 2);
      q.onerror = () => reject(q.error);
      q.onsuccess = () => {
        const db = q.result;
        const tx = db.transaction(['records','weights','state'], 'readonly');
        const a = tx.objectStore('records').getAll();
        const b = tx.objectStore('weights').getAll();
        const s = tx.objectStore('state').get('settings');
        let r,w,settings;
        const done = () => { if (r && w && settings !== undefined) resolve({
          recordIds:r.map(x=>x.id), weightIds:w.map(x=>x.id),
          settings:settings && settings.data, storageGeneration:settings && settings.storageGeneration
        }); };
        a.onsuccess=()=>{r=a.result;done()};
        b.onsuccess=()=>{w=b.result;done()};
        s.onsuccess=()=>{settings=s.result || null;done()};
        a.onerror=b.onerror=s.onerror=()=>reject(a.error||b.error||s.error);
      };
    })""")


def main():
    if not (V1126 / "index.html").is_file() or not (V1128 / "index.html").is_file():
        raise SystemExit("Missing extracted v1.12.6/v1.12.8 source trees")
    global active_root
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{server.server_port}"
    expected_records, expected_weights = make_records()
    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path="/usr/bin/chromium", headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"]
            )
            context = browser.new_context(viewport={"width": 390, "height": 844})
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(origin, wait_until="domcontentloaded")
            page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent.includes('1.12.6')", timeout=20000)
            page.wait_for_timeout(700)

            # Seed genuine IndexedDB after v1.12.6 has created the real schema.
            page.evaluate("""({records,weights}) => new Promise((resolve,reject) => {
              const q=indexedDB.open('FastingTrackerDB',2);
              q.onerror=()=>reject(q.error);
              q.onsuccess=()=>{
                const db=q.result;
                const tx=db.transaction(['state','records','deletedFasts','weights','deletedWeights'],'readwrite');
                tx.objectStore('state').put({key:'settings',storageGeneration:3,data:{
                  dataVersion:1,revision:1,updatedAt:new Date().toISOString(),goalHours:16,
                  activeStart:null,activeGoalHours:null,activeTimeZone:null,
                  activeCreatedAt:null,activeModifiedAt:null,weightUnit:'kg',targetWeightKg:75,
                  gamificationEnabled:false,language:'en',appearance:'light',iconChoice:'plate'
                }});
                for(const name of ['records','deletedFasts','weights','deletedWeights']) tx.objectStore(name).clear();
                records.forEach(x=>tx.objectStore('records').put(x));
                weights.forEach(x=>tx.objectStore('weights').put(x));
                tx.oncomplete=()=>resolve();
                tx.onerror=tx.onabort=()=>reject(tx.error||new Error('seed transaction failed'));
              };
            })""", {"records":expected_records,"weights":expected_weights})
            await_reload = lambda: None
            page.reload(wait_until="domcontentloaded")
            page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent.includes('1.12.6')", timeout=20000)
            page.locator('.tab[data-screen="history"]').click()
            page.wait_for_function("document.querySelectorAll('#historyList .historyRow').length === 16", timeout=15000)
            before = read_counts(page)
            assert before["recordIds"] == [x["id"] for x in expected_records], before
            assert before["weightIds"] == [x["id"] for x in expected_weights], before

            # Change only the served source tree: origin, browser context and native
            # IndexedDB remain unchanged, which models an in-place web-app update.
            with ROOT_LOCK:
                active_root = V1128
            page.goto(origin + "/?upgrade=1", wait_until="domcontentloaded")
            page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent.includes('1.12.8')", timeout=20000)
            page.locator('.tab[data-screen="history"]').click()
            page.wait_for_function("document.querySelectorAll('#historyList .historyRow').length === 16", timeout=15000)
            after = read_counts(page)
            assert after["recordIds"] == before["recordIds"], {"before":before,"after":after}
            assert after["weightIds"] == before["weightIds"], {"before":before,"after":after}
            assert after["settings"] and after["settings"].get("activeStart") is None, after
            page.reload(wait_until="domcontentloaded")
            page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent.includes('1.12.8')", timeout=20000)
            page.locator('.tab[data-screen="history"]').click()
            page.wait_for_function("document.querySelectorAll('#historyList .historyRow').length === 16", timeout=15000)
            final = read_counts(page)
            assert final["recordIds"] == before["recordIds"], {"before":before,"final":final}
            assert final["weightIds"] == before["weightIds"], {"before":before,"final":final}
            assert not errors, errors[:10]
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print("PASS: native Chromium IndexedDB preserves 16 completed fasts and 16 weights across same-origin v1.12.6 -> v1.12.8 transition and reload")


if __name__ == "__main__":
    main()
